/**
 * Nómina técnica (Fase 9).
 *
 * Responsabilidades:
 * - Identificar mecánicos elegibles (usuarios con rol `mecanico` y `isActive`).
 * - Leer/crear la configuración de % por técnico (`TechnicianPayrollConfig`).
 * - Calcular la semana de nómina (lunes→sábado) agregando MO neta de OTs DELIVERED
 *   cuyo `deliveredAt` cae en la ventana. Persiste una `PayrollRun` por técnico + semana.
 * - Ajustes (bonos / adelantos / deducciones / otros) aplicables mientras la corrida esté en DRAFT.
 * - Pago: genera un `CashMovement` EXPENSE con categoría `nomina_mecanicos`, marca `PAID`.
 * - Anulación: reversa el pago (marca VOIDED) manteniendo trazabilidad del CashMovement ya registrado.
 *
 * Regla operativa: una OT sólo puede aparecer en UNA corrida no-VOIDED (UNIQUE en DB). Si la OT
 * se reabre + re-entrega después del pago, su nuevo `deliveredAt` determina la siguiente semana.
 */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CashMovementDirection,
  CashSessionStatus,
  PayrollAdjustmentKind,
  PayrollStatus,
  Prisma,
  WorkOrderLineType,
  WorkOrderStatus,
} from '@prisma/client';
import { ceilWholeCop, decimalFromMoneyApiString } from '../../common/money/cop-money';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CashAccessService } from '../cash/cash-access.service';
import type { CreatePayrollAdjustmentDto } from './dto/create-adjustment.dto';
import type { PayPayrollRunDto } from './dto/pay-run.dto';
import type { UpdateTechnicianPayrollConfigDto } from './dto/update-technician-config.dto';
import {
  DEFAULT_LABOR_COMMISSION_PCT,
  PAYROLL_CASH_CATEGORY_SLUG,
  PAYROLL_CASH_REFERENCE_TYPE,
  PAYROLL_OWNER_ROLE_SLUGS,
  TECHNICIAN_ROLE_SLUG,
} from './payroll.constants';
import {
  formatDateOnlyUtc,
  parseDateOnlyUtc,
  weekEndSaturdayUtc,
  weekStartMondayUtc,
  weekStartMondayUtcFromYmd,
} from './payroll-week.util';

type TechnicianView = {
  userId: string;
  email: string;
  fullName: string;
  isActiveUser: boolean;
  commissionPct: number;
  isActiveInPayroll: boolean;
  notes: string | null;
};

@Injectable()
export class PayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly cashAccess: CashAccessService,
  ) {}

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /** Devuelve el lunes (YYYY-MM-DD) de la semana actual para la app (hoy ∈ [lun..dom]). */
  private currentWeekStartYmd(): string {
    const now = new Date();
    const dow = now.getUTCDay();
    // Si hoy es domingo, mostramos la semana que acaba de cerrarse (ese lunes pasado).
    if (dow === 0) {
      const lastMonday = new Date(now.getTime());
      lastMonday.setUTCDate(lastMonday.getUTCDate() - 6);
      lastMonday.setUTCHours(0, 0, 0, 0);
      return formatDateOnlyUtc(lastMonday);
    }
    return formatDateOnlyUtc(weekStartMondayUtc(now));
  }

  private async ensureOwner(actorUserId: string) {
    const slugs = await this.cashAccess.getRoleSlugsForUser(actorUserId);
    const isOwner = slugs.some((s) => (PAYROLL_OWNER_ROLE_SLUGS as readonly string[]).includes(s));
    if (!isOwner) {
      throw new ForbiddenException('Solo el dueño o administrador pueden realizar esta operación.');
    }
  }

  /** Pesos enteros ceil (consistente con el resto del sistema). */
  private money(n: Prisma.Decimal | number | string): Prisma.Decimal {
    const d = typeof n === 'string' || typeof n === 'number' ? new Prisma.Decimal(n) : n;
    return ceilWholeCop(d);
  }

  /** Signo efectivo del ajuste según `kind` (monto siempre positivo; el signo lo decide el servidor). */
  private signedAdjustment(kind: PayrollAdjustmentKind, amount: Prisma.Decimal): Prisma.Decimal {
    if (kind === PayrollAdjustmentKind.ADVANCE || kind === PayrollAdjustmentKind.DEDUCTION) {
      return amount.neg();
    }
    return amount;
  }

  /** Subtotal neto de una línea LABOR: qty × unitPrice − discount (sin IVA). */
  private laborSubtotal(
    quantity: Prisma.Decimal,
    unitPrice: Prisma.Decimal | null,
    discount: Prisma.Decimal | null,
  ): Prisma.Decimal {
    if (!unitPrice) return new Prisma.Decimal(0);
    const gross = quantity.mul(unitPrice);
    const neto = gross.sub(discount ?? new Prisma.Decimal(0));
    return neto.lt(0) ? new Prisma.Decimal(0) : this.money(neto);
  }

  /** Lista mecánicos (usuarios con rol `mecanico`) + % configurado. */
  private async listTechnicians(): Promise<TechnicianView[]> {
    const rows = await this.prisma.user.findMany({
      where: {
        roles: {
          some: { role: { slug: TECHNICIAN_ROLE_SLUG } },
        },
      },
      orderBy: [{ isActive: 'desc' }, { fullName: 'asc' }],
      select: {
        id: true,
        email: true,
        fullName: true,
        isActive: true,
        payrollConfig: true,
      },
    });
    return rows.map((u) => ({
      userId: u.id,
      email: u.email,
      fullName: u.fullName,
      isActiveUser: u.isActive,
      commissionPct: u.payrollConfig
        ? Number(u.payrollConfig.laborCommissionPct)
        : DEFAULT_LABOR_COMMISSION_PCT,
      isActiveInPayroll: u.payrollConfig ? u.payrollConfig.isActive : true,
      notes: u.payrollConfig?.notes ?? null,
    }));
  }

  // -------------------------------------------------------------------------
  // Configuración por técnico (solo dueño/admin)
  // -------------------------------------------------------------------------

  async listTechniciansConfig(actorUserId: string) {
    await this.ensureOwner(actorUserId);
    return this.listTechnicians();
  }

  async updateTechnicianConfig(
    actorUserId: string,
    userId: string,
    dto: UpdateTechnicianPayrollConfigDto,
  ) {
    await this.ensureOwner(actorUserId);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        roles: { include: { role: { select: { slug: true } } } },
        payrollConfig: true,
      },
    });
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }
    const hasTecnicoRole = user.roles.some((r) => r.role.slug === TECHNICIAN_ROLE_SLUG);
    if (!hasTecnicoRole) {
      throw new BadRequestException('El usuario no tiene el rol técnico asignado.');
    }

    const previous = user.payrollConfig
      ? {
          laborCommissionPct: Number(user.payrollConfig.laborCommissionPct),
          isActive: user.payrollConfig.isActive,
          notes: user.payrollConfig.notes,
        }
      : null;

    const laborPct =
      dto.laborCommissionPct !== undefined
        ? new Prisma.Decimal(dto.laborCommissionPct.toFixed(2))
        : previous
          ? new Prisma.Decimal(previous.laborCommissionPct.toFixed(2))
          : new Prisma.Decimal(DEFAULT_LABOR_COMMISSION_PCT.toFixed(2));

    const isActive = dto.isActive !== undefined ? dto.isActive : previous ? previous.isActive : true;
    const notes = dto.notes !== undefined ? dto.notes : previous?.notes ?? null;

    const saved = await this.prisma.technicianPayrollConfig.upsert({
      where: { userId },
      create: {
        userId,
        laborCommissionPct: laborPct,
        isActive,
        notes,
      },
      update: {
        laborCommissionPct: laborPct,
        isActive,
        notes,
      },
    });

    await this.audit.recordDomain({
      actorUserId,
      action: 'payroll.config.updated',
      entityType: 'TechnicianPayrollConfig',
      entityId: saved.id,
      previousPayload: previous,
      nextPayload: {
        userId,
        laborCommissionPct: Number(saved.laborCommissionPct),
        isActive: saved.isActive,
      },
    });

    return {
      userId,
      commissionPct: Number(saved.laborCommissionPct),
      isActive: saved.isActive,
      notes: saved.notes,
    };
  }

  // -------------------------------------------------------------------------
  // Resumen y cálculo de semana
  // -------------------------------------------------------------------------

  /** Montos de MO (base y por OT): solo personal que gestiona nómina, no vista “solo lectura” de técnico. */
  private canViewPayrollLaborAmounts(permissions: string[] | undefined): boolean {
    if (!permissions?.length) return false;
    return (
      permissions.includes('payroll:calculate') ||
      permissions.includes('payroll:pay') ||
      permissions.includes('payroll:configure')
    );
  }

  async getWeekSummary(weekStartYmd?: string, actorPermissions?: string[]) {
    const includeLaborAmounts =
      actorPermissions === undefined ? true : this.canViewPayrollLaborAmounts(actorPermissions);
    const ymd = weekStartYmd ?? this.currentWeekStartYmd();
    const start = weekStartMondayUtcFromYmd(ymd);
    const end = weekEndSaturdayUtc(start);

    const [technicians, runs, unassignedOtsAgg] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where: {
          roles: { some: { role: { slug: TECHNICIAN_ROLE_SLUG } } },
        },
        orderBy: [{ isActive: 'desc' }, { fullName: 'asc' }],
        select: {
          id: true,
          email: true,
          fullName: true,
          isActive: true,
          payrollConfig: true,
        },
      }),
      this.prisma.payrollRun.findMany({
        where: { weekStart: start },
        include: {
          technician: { select: { id: true, fullName: true, email: true } },
          adjustments: { orderBy: { createdAt: 'asc' } },
          entries: {
            orderBy: { deliveredAt: 'asc' },
            include: {
              workOrder: {
                select: {
                  id: true,
                  publicCode: true,
                  vehiclePlate: true,
                  customerName: true,
                  deliveredAt: true,
                },
              },
            },
          },
          cashMovement: { select: { id: true, createdAt: true } },
        },
      }),
      this.prisma.workOrder.findMany({
        where: {
          status: WorkOrderStatus.DELIVERED,
          deliveredAt: { gte: start, lte: end },
          assignedToId: null,
          lines: { some: { lineType: WorkOrderLineType.LABOR } },
        },
        select: {
          id: true,
          publicCode: true,
          deliveredAt: true,
          vehiclePlate: true,
          customerName: true,
          lines: {
            where: { lineType: WorkOrderLineType.LABOR },
            select: { quantity: true, unitPrice: true, discountAmount: true },
          },
        },
      }),
    ]);

    const runsByTech = new Map(runs.map((r) => [r.technicianId, r]));

    const unassigned = {
      ots: unassignedOtsAgg.map((wo) => {
        const ln = wo.lines[0];
        const sub = ln
          ? this.laborSubtotal(ln.quantity, ln.unitPrice, ln.discountAmount)
          : new Prisma.Decimal(0);
        return {
          workOrderId: wo.id,
          publicCode: wo.publicCode,
          vehiclePlate: wo.vehiclePlate,
          customerName: wo.customerName,
          deliveredAt: wo.deliveredAt,
          laborSubtotal: sub.toString(),
        };
      }),
      totalLaborSubtotal: unassignedOtsAgg
        .reduce((acc, wo) => {
          const ln = wo.lines[0];
          if (!ln) return acc;
          return acc.add(this.laborSubtotal(ln.quantity, ln.unitPrice, ln.discountAmount));
        }, new Prisma.Decimal(0))
        .toString(),
    };

    const rows = technicians.map((tech) => {
      const run = runsByTech.get(tech.id);
      const pct = tech.payrollConfig
        ? Number(tech.payrollConfig.laborCommissionPct)
        : DEFAULT_LABOR_COMMISSION_PCT;
      return {
        technician: {
          userId: tech.id,
          fullName: tech.fullName,
          email: tech.email,
          isActiveUser: tech.isActive,
          commissionPct: pct,
          isActiveInPayroll: tech.payrollConfig ? tech.payrollConfig.isActive : true,
        },
        run: run
          ? this.serializeRun(run, includeLaborAmounts)
          : null,
      };
    });

    const unassignedOut = includeLaborAmounts
      ? unassigned
      : { ots: [] as (typeof unassigned)['ots'], totalLaborSubtotal: null };

    return {
      weekStart: formatDateOnlyUtc(start),
      weekEnd: formatDateOnlyUtc(end),
      weekStartIso: start.toISOString(),
      weekEndIso: end.toISOString(),
      rows,
      unassigned: unassignedOut,
      totals: {
        commissionDraft: rows
          .reduce((acc, r) => (r.run && r.run.status === 'DRAFT' ? acc.add(new Prisma.Decimal(r.run.totalToPay)) : acc), new Prisma.Decimal(0))
          .toString(),
        commissionPaid: rows
          .reduce((acc, r) => (r.run && r.run.status === 'PAID' ? acc.add(new Prisma.Decimal(r.run.totalToPay)) : acc), new Prisma.Decimal(0))
          .toString(),
      },
    };
  }

  async recalculateWeek(actorUserId: string, weekStartYmd: string) {
    const start = weekStartMondayUtcFromYmd(weekStartYmd);
    const end = weekEndSaturdayUtc(start);

    // Técnicos elegibles
    const technicians = await this.prisma.user.findMany({
      where: {
        roles: { some: { role: { slug: TECHNICIAN_ROLE_SLUG } } },
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        isActive: true,
        payrollConfig: true,
      },
    });

    for (const tech of technicians) {
      const pctNumber = tech.payrollConfig
        ? Number(tech.payrollConfig.laborCommissionPct)
        : DEFAULT_LABOR_COMMISSION_PCT;
      const pct = new Prisma.Decimal(pctNumber.toFixed(2));

      // OTs elegibles para este técnico en la ventana
      const ots = await this.prisma.workOrder.findMany({
        where: {
          status: WorkOrderStatus.DELIVERED,
          assignedToId: tech.id,
          deliveredAt: { gte: start, lte: end },
          lines: { some: { lineType: WorkOrderLineType.LABOR } },
        },
        select: {
          id: true,
          deliveredAt: true,
          lines: {
            where: { lineType: WorkOrderLineType.LABOR },
            select: { quantity: true, unitPrice: true, discountAmount: true },
          },
        },
      });

      // Si esa OT ya está en otra PayrollRun no-VOIDED (p. ej. pagada en una semana distinta
      // por reapertura/re-entrega), la excluímos aquí para no romper el UNIQUE.
      const activeExistingEntries = await this.prisma.payrollRunEntry.findMany({
        where: {
          workOrderId: { in: ots.map((o) => o.id) },
          run: { status: { not: PayrollStatus.VOIDED } },
        },
        select: { workOrderId: true, payrollRunId: true },
      });
      const lockedOtIds = new Set<string>();
      const existingRun = await this.prisma.payrollRun.findUnique({
        where: { technicianId_weekStart: { technicianId: tech.id, weekStart: start } },
        select: { id: true, status: true },
      });
      for (const e of activeExistingEntries) {
        // Permitimos sobreescribir las de la corrida actual si está en DRAFT
        if (existingRun && e.payrollRunId === existingRun.id && existingRun.status === PayrollStatus.DRAFT) {
          continue;
        }
        lockedOtIds.add(e.workOrderId);
      }

      const usableOts = ots.filter((o) => !lockedOtIds.has(o.id));

      const entries = usableOts.map((wo) => {
        const ln = wo.lines[0]; // regla: una sola LABOR por OT
        const sub = ln
          ? this.laborSubtotal(ln.quantity, ln.unitPrice, ln.discountAmount)
          : new Prisma.Decimal(0);
        const commission = this.money(sub.mul(pct).div(100));
        return {
          workOrderId: wo.id,
          deliveredAt: wo.deliveredAt!,
          laborSubtotal: sub,
          commission,
        };
      });

      const base = entries.reduce((acc, e) => acc.add(e.laborSubtotal), new Prisma.Decimal(0));
      const commissionAmount = entries.reduce((acc, e) => acc.add(e.commission), new Prisma.Decimal(0));

      // ¿Hay algo que recalcular?
      if (!existingRun && entries.length === 0) {
        continue;
      }
      if (existingRun && existingRun.status !== PayrollStatus.DRAFT) {
        // Las PAID / VOIDED no se tocan.
        continue;
      }

      // Cargamos ajustes actuales (sobreviven al recalculate; solo se suman al total).
      const adjustmentsTotal = existingRun
        ? await this.prisma.payrollAdjustment.aggregate({
            where: { payrollRunId: existingRun.id },
            _sum: { amount: true },
          })
        : { _sum: { amount: null as Prisma.Decimal | null } };
      const adjSum = adjustmentsTotal._sum.amount ?? new Prisma.Decimal(0);
      const totalToPay = commissionAmount.add(adjSum);

      await this.prisma.$transaction(async (tx) => {
        const run = await tx.payrollRun.upsert({
          where: { technicianId_weekStart: { technicianId: tech.id, weekStart: start } },
          create: {
            technicianId: tech.id,
            weekStart: start,
            weekEnd: end,
            status: PayrollStatus.DRAFT,
            commissionPctApplied: pct,
            baseAmount: base,
            commissionAmount,
            adjustmentsTotal: adjSum,
            totalToPay,
          },
          update: {
            weekEnd: end,
            commissionPctApplied: pct,
            baseAmount: base,
            commissionAmount,
            adjustmentsTotal: adjSum,
            totalToPay,
          },
        });

        // Reescribimos entries desde cero (la corrida está en DRAFT).
        await tx.payrollRunEntry.deleteMany({ where: { payrollRunId: run.id } });
        if (entries.length > 0) {
          await tx.payrollRunEntry.createMany({
            data: entries.map((e) => ({
              payrollRunId: run.id,
              workOrderId: e.workOrderId,
              laborSubtotal: e.laborSubtotal,
              commission: e.commission,
              deliveredAt: e.deliveredAt,
            })),
          });
        }
      });
    }

    await this.audit.recordDomain({
      actorUserId,
      action: 'payroll.week.recalculated',
      entityType: 'PayrollRun',
      entityId: null,
      previousPayload: null,
      nextPayload: {
        weekStart: formatDateOnlyUtc(start),
        weekEnd: formatDateOnlyUtc(end),
      },
    });

    return this.getWeekSummary(formatDateOnlyUtc(start));
  }

  // -------------------------------------------------------------------------
  // Ajustes
  // -------------------------------------------------------------------------

  async addAdjustment(actorUserId: string, payrollRunId: string, dto: CreatePayrollAdjustmentDto) {
    const run = await this.prisma.payrollRun.findUnique({ where: { id: payrollRunId } });
    if (!run) {
      throw new NotFoundException('Corrida de nómina no encontrada');
    }
    if (run.status !== PayrollStatus.DRAFT) {
      throw new ConflictException('Solo se pueden editar ajustes en corridas en borrador (DRAFT).');
    }
    const amount = decimalFromMoneyApiString(dto.amount.replace(/^-/, '')); // forzamos positivo
    if (amount.lte(0)) {
      throw new BadRequestException('El monto del ajuste debe ser mayor a cero.');
    }
    const signed = this.signedAdjustment(dto.kind, amount);

    const { adjustment, updatedRun } = await this.prisma.$transaction(async (tx) => {
      const adj = await tx.payrollAdjustment.create({
        data: {
          payrollRunId: run.id,
          kind: dto.kind,
          amount: signed,
          note: dto.note ?? null,
          createdById: actorUserId,
        },
      });
      const updated = await tx.payrollRun.update({
        where: { id: run.id },
        data: {
          adjustmentsTotal: { increment: signed },
          totalToPay: { increment: signed },
        },
      });
      return { adjustment: adj, updatedRun: updated };
    });

    await this.audit.recordDomain({
      actorUserId,
      action: 'payroll.adjustment.created',
      entityType: 'PayrollAdjustment',
      entityId: adjustment.id,
      previousPayload: null,
      nextPayload: {
        payrollRunId: run.id,
        kind: dto.kind,
        amountInput: dto.amount,
        signedAmount: signed.toString(),
        note: dto.note ?? null,
      },
    });

    return { adjustment, run: updatedRun };
  }

  async removeAdjustment(actorUserId: string, payrollRunId: string, adjustmentId: string) {
    const adj = await this.prisma.payrollAdjustment.findFirst({
      where: { id: adjustmentId, payrollRunId },
      include: { run: true },
    });
    if (!adj) {
      throw new NotFoundException('Ajuste no encontrado');
    }
    if (adj.run.status !== PayrollStatus.DRAFT) {
      throw new ConflictException('Solo se pueden quitar ajustes en corridas en borrador (DRAFT).');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.payrollAdjustment.delete({ where: { id: adj.id } });
      await tx.payrollRun.update({
        where: { id: payrollRunId },
        data: {
          adjustmentsTotal: { decrement: adj.amount },
          totalToPay: { decrement: adj.amount },
        },
      });
    });

    await this.audit.recordDomain({
      actorUserId,
      action: 'payroll.adjustment.deleted',
      entityType: 'PayrollAdjustment',
      entityId: adj.id,
      previousPayload: {
        payrollRunId,
        kind: adj.kind,
        amount: adj.amount.toString(),
      },
      nextPayload: null,
    });

    return { ok: true };
  }

  // -------------------------------------------------------------------------
  // Pago (genera CashMovement EXPENSE)
  // -------------------------------------------------------------------------

  async payRun(
    actorUserId: string,
    payrollRunId: string,
    dto: PayPayrollRunDto,
    meta: { ip?: string; userAgent?: string },
  ) {
    const run = await this.prisma.payrollRun.findUnique({
      where: { id: payrollRunId },
      include: {
        technician: { select: { id: true, fullName: true, email: true } },
      },
    });
    if (!run) {
      throw new NotFoundException('Corrida de nómina no encontrada');
    }
    if (run.status !== PayrollStatus.DRAFT) {
      throw new ConflictException('Solo se pueden pagar corridas en borrador (DRAFT).');
    }
    if (run.totalToPay.lte(0)) {
      throw new BadRequestException(
        'El total a pagar debe ser mayor a cero. Si hubo ajustes que anulan la comisión, anulá la corrida en lugar de pagarla.',
      );
    }

    const session = await this.prisma.cashSession.findFirst({
      where: { status: CashSessionStatus.OPEN },
    });
    if (!session) {
      throw new ConflictException('No hay sesión de caja abierta. Abrí caja antes de pagar nómina.');
    }

    const category = await this.prisma.cashMovementCategory.findUnique({
      where: { slug: PAYROLL_CASH_CATEGORY_SLUG },
    });
    if (!category) {
      throw new NotFoundException(
        `Categoría "${PAYROLL_CASH_CATEGORY_SLUG}" no encontrada. Volvé a correr el seed.`,
      );
    }
    if (category.direction !== CashMovementDirection.EXPENSE) {
      throw new BadRequestException('La categoría de nómina debe ser de egreso (EXPENSE).');
    }

    const weekStartYmd = formatDateOnlyUtc(run.weekStart);
    const weekEndYmd = formatDateOnlyUtc(run.weekEnd);
    const fullName = run.technician.fullName;
    const noteFromUser = dto.note?.trim();
    const noteText = noteFromUser
      ? `Nómina ${fullName} · semana ${weekStartYmd}→${weekEndYmd} · ${noteFromUser}`
      : `Nómina ${fullName} · semana ${weekStartYmd}→${weekEndYmd}`;

    const result = await this.prisma.$transaction(async (tx) => {
      const movement = await tx.cashMovement.create({
        data: {
          sessionId: session.id,
          categoryId: category.id,
          direction: CashMovementDirection.EXPENSE,
          amount: run.totalToPay,
          tenderAmount: null,
          changeAmount: null,
          referenceType: PAYROLL_CASH_REFERENCE_TYPE,
          referenceId: run.id,
          note: noteText,
          createdById: actorUserId,
        },
      });
      const updated = await tx.payrollRun.update({
        where: { id: run.id },
        data: {
          status: PayrollStatus.PAID,
          paidAt: new Date(),
          cashMovementId: movement.id,
        },
      });
      return { movement, updated };
    });

    await this.audit.recordDomain({
      actorUserId,
      action: 'payroll.run.paid',
      entityType: 'PayrollRun',
      entityId: run.id,
      previousPayload: {
        status: PayrollStatus.DRAFT,
      },
      nextPayload: {
        status: PayrollStatus.PAID,
        cashMovementId: result.movement.id,
        totalPaid: run.totalToPay.toString(),
        technicianId: run.technicianId,
        weekStart: weekStartYmd,
        weekEnd: weekEndYmd,
        note: noteText,
      },
      ipAddress: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    });

    return {
      run: result.updated,
      cashMovementId: result.movement.id,
    };
  }

  async voidRun(actorUserId: string, payrollRunId: string, reason: string) {
    await this.ensureOwner(actorUserId);
    const trimmed = reason?.trim();
    if (!trimmed || trimmed.length < 5) {
      throw new BadRequestException('Debés indicar un motivo (mínimo 5 caracteres) para anular la corrida.');
    }
    const run = await this.prisma.payrollRun.findUnique({
      where: { id: payrollRunId },
      include: { cashMovement: { select: { id: true, sessionId: true, session: { select: { status: true } } } } },
    });
    if (!run) {
      throw new NotFoundException('Corrida no encontrada');
    }
    if (run.status !== PayrollStatus.PAID) {
      throw new ConflictException('Solo corridas PAGADAS pueden anularse.');
    }
    if (run.cashMovement && run.cashMovement.session.status !== CashSessionStatus.OPEN) {
      throw new ConflictException(
        'La caja del pago ya fue cerrada; no se puede anular automáticamente. Registrá un ajuste en la semana siguiente.',
      );
    }

    // Reverso: creamos un ingreso de corrección con la misma categoría (o dejamos ajuste?).
    // Regla del sistema: los movimientos de caja son append-only. Entonces registramos un
    // INCOME en la misma categoría "nomina_mecanicos"? No — esa categoría es sólo EXPENSE.
    // En su lugar usamos `ingreso_otro` con referencia al PayrollRun.
    const reversalCategory = await this.prisma.cashMovementCategory.findUnique({
      where: { slug: 'ingreso_otro' },
    });
    if (!reversalCategory) {
      throw new NotFoundException('Falta categoría "ingreso_otro" para reversar el pago de nómina.');
    }

    await this.prisma.$transaction(async (tx) => {
      if (run.cashMovementId) {
        await tx.cashMovement.create({
          data: {
            sessionId: run.cashMovement!.sessionId,
            categoryId: reversalCategory.id,
            direction: CashMovementDirection.INCOME,
            amount: run.totalToPay,
            tenderAmount: null,
            changeAmount: null,
            referenceType: PAYROLL_CASH_REFERENCE_TYPE,
            referenceId: run.id,
            note: `Reversión pago nómina (anulado): ${trimmed}`,
            createdById: actorUserId,
          },
        });
      }
      await tx.payrollRun.update({
        where: { id: run.id },
        data: { status: PayrollStatus.VOIDED, notes: trimmed },
      });
    });

    await this.audit.recordDomain({
      actorUserId,
      action: 'payroll.run.voided',
      entityType: 'PayrollRun',
      entityId: run.id,
      previousPayload: { status: PayrollStatus.PAID },
      nextPayload: { status: PayrollStatus.VOIDED, reason: trimmed },
    });

    return { ok: true };
  }

  // -------------------------------------------------------------------------
  // Detalle
  // -------------------------------------------------------------------------

  async getRunDetail(payrollRunId: string, actorPermissions?: string[]) {
    const includeLaborAmounts =
      actorPermissions === undefined ? true : this.canViewPayrollLaborAmounts(actorPermissions);
    const run = await this.prisma.payrollRun.findUnique({
      where: { id: payrollRunId },
      include: {
        technician: { select: { id: true, fullName: true, email: true } },
        entries: {
          orderBy: { deliveredAt: 'asc' },
          include: {
            workOrder: {
              select: {
                id: true,
                publicCode: true,
                vehiclePlate: true,
                vehicleBrand: true,
                vehicleModel: true,
                customerName: true,
                deliveredAt: true,
                status: true,
              },
            },
          },
        },
        adjustments: {
          orderBy: { createdAt: 'asc' },
          include: {
            createdBy: { select: { id: true, fullName: true, email: true } },
          },
        },
        cashMovement: { select: { id: true, createdAt: true } },
      },
    });
    if (!run) {
      throw new NotFoundException('Corrida no encontrada');
    }
    return this.serializeRunDetail(run, includeLaborAmounts);
  }

  // -------------------------------------------------------------------------
  // Serializers
  // -------------------------------------------------------------------------

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private serializeRun(run: any, includeLaborAmounts = true) {
    return {
      id: run.id as string,
      technicianId: run.technicianId as string,
      technician: run.technician as { id: string; fullName: string; email: string },
      weekStart: formatDateOnlyUtc(run.weekStart as Date),
      weekEnd: formatDateOnlyUtc(run.weekEnd as Date),
      status: run.status as PayrollStatus,
      commissionPctApplied: Number(run.commissionPctApplied),
      baseAmount: includeLaborAmounts ? (run.baseAmount as Prisma.Decimal).toString() : null,
      commissionAmount: (run.commissionAmount as Prisma.Decimal).toString(),
      adjustmentsTotal: (run.adjustmentsTotal as Prisma.Decimal).toString(),
      totalToPay: (run.totalToPay as Prisma.Decimal).toString(),
      paidAt: (run.paidAt as Date | null)?.toISOString() ?? null,
      cashMovementId: (run.cashMovementId as string | null) ?? null,
      cashMovement: run.cashMovement
        ? {
            id: run.cashMovement.id as string,
            createdAt: (run.cashMovement.createdAt as Date).toISOString(),
          }
        : null,
      otsCount: Array.isArray(run.entries) ? run.entries.length : 0,
      adjustments: (run.adjustments ?? []).map(
        (a: {
          id: string;
          kind: PayrollAdjustmentKind;
          amount: Prisma.Decimal;
          note: string | null;
          createdAt: Date;
          createdBy?: { id: string; fullName: string; email: string };
        }) => ({
          id: a.id,
          kind: a.kind,
          amount: a.amount.toString(),
          note: a.note,
          createdAt: a.createdAt.toISOString(),
          createdBy: a.createdBy ?? null,
        }),
      ),
      entries: (run.entries ?? []).map(
        (e: {
          id: string;
          workOrderId: string;
          laborSubtotal: Prisma.Decimal;
          commission: Prisma.Decimal;
          deliveredAt: Date;
          workOrder: {
            id: string;
            publicCode: string;
            vehiclePlate: string | null;
            vehicleBrand?: string | null;
            vehicleModel?: string | null;
            customerName: string | null;
            deliveredAt: Date | null;
            status?: WorkOrderStatus;
          };
        }) => ({
          id: e.id,
          workOrderId: e.workOrderId,
          publicCode: e.workOrder.publicCode,
          vehiclePlate: e.workOrder.vehiclePlate,
          vehicleBrand: e.workOrder.vehicleBrand ?? null,
          vehicleModel: e.workOrder.vehicleModel ?? null,
          customerName: e.workOrder.customerName,
          deliveredAt: e.deliveredAt.toISOString(),
          laborSubtotal: includeLaborAmounts ? e.laborSubtotal.toString() : null,
          commission: e.commission.toString(),
          workOrderStatus: e.workOrder.status ?? null,
        }),
      ),
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private serializeRunDetail(run: any, includeLaborAmounts = true) {
    return this.serializeRun(run, includeLaborAmounts);
  }

  // -------------------------------------------------------------------------
  // Public: para uso interno del módulo (parse ymd fallback a "hoy").
  // -------------------------------------------------------------------------

  resolveWeekStart(ymd?: string): Date {
    if (ymd) {
      const d = parseDateOnlyUtc(ymd);
      return weekStartMondayUtcFromYmd(formatDateOnlyUtc(d));
    }
    return weekStartMondayUtcFromYmd(this.currentWeekStartYmd());
  }
}
