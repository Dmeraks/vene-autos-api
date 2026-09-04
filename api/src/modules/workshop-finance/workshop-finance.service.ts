import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  CashMovementDirection,
  CashSessionStatus,
  Prisma,
  WorkshopPayablePaymentMethod,
  WorkshopPayableStatus,
} from '@prisma/client';
import { ceilWholeCop, decimalFromMoneyApiString } from '../../common/money/cop-money';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CashAccessService } from '../cash/cash-access.service';
import { NotesPolicyService } from '../../common/notes-policy/notes-policy.service';
import { CASH_WORKSHOP_PAYABLE_PAYMENT_REF } from './workshop-finance.constants';
import type { CreateWorkshopPayableDto } from './dto/create-payable.dto';
import type { CreateWorkshopReserveLineDto } from './dto/create-reserve-line.dto';
import type { PayWorkshopPayableDto } from './dto/pay-payable.dto';
import type { UpdateWorkshopReserveLineDto } from './dto/update-reserve-line.dto';

const PAGO_DEUDA_CATEGORY_SLUG = 'pago_proveedor';

@Injectable()
export class WorkshopFinanceService {
  private readonly logger = new Logger(WorkshopFinanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notes: NotesPolicyService,
    private readonly cashAccess: CashAccessService,
  ) {}

  private async ensureExpensePrivilege(actorUserId: string): Promise<void> {
    const slugs = await this.cashAccess.getRoleSlugsForUser(actorUserId);
    if (!this.cashAccess.isElevated(slugs)) {
      const ok = await this.cashAccess.isExpenseDelegate(actorUserId);
      if (!ok) {
        throw new ForbiddenException(
          'Solo dueño/administrador o delegados autorizados pueden registrar pagos en efectivo desde caja.',
        );
      }
    }
  }

  /**
   * Convierte fallos típicos de Prisma en HTTP con mensaje claro (lecturas y altas/edición).
   */
  private mapPrismaFailure(e: unknown): HttpException | null {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      this.logger.warn(`Prisma ${e.code} en finanzas taller: ${e.message}`);
      if (e.code === 'P2002') {
        return new HttpException(
          'Ya existe un registro duplicado para ese valor. Probá otro nombre o revisá datos únicos.',
          HttpStatus.CONFLICT,
        );
      }
      if (e.code === 'P2003') {
        return new HttpException(
          'Violación de integridad referencial (usuario o relación inexistente). Cerrá sesión y volvé a entrar, o revisá migraciones.',
          HttpStatus.BAD_REQUEST,
        );
      }
      if (e.code === 'P2021') {
        return new HttpException(
          'Faltan tablas de finanzas del taller en la base de datos. En el servidor, desde la carpeta api: npx prisma migrate deploy (y luego npx prisma generate), y reiniciá la API.',
          HttpStatus.FAILED_DEPENDENCY,
        );
      }
      if (e.code === 'P2022') {
        return new HttpException(
          'El esquema de la base no coincide con el código (columna o tipo). Aplicá migraciones y ejecutá npx prisma generate en api, luego reiniciá.',
          HttpStatus.FAILED_DEPENDENCY,
        );
      }
      return new HttpException(
        `Error de base de datos al leer finanzas del taller (código ${e.code}). Revisá migraciones y la consola del servidor.`,
        HttpStatus.FAILED_DEPENDENCY,
      );
    }
    const name = e && typeof e === 'object' && 'name' in e ? String((e as { name?: string }).name) : '';
    const msg = e instanceof Error ? e.message : String(e);
    if (name === 'PrismaClientInitializationError' || msg.includes('PrismaClient')) {
      this.logger.warn(`Inicialización Prisma: ${msg}`);
      return new HttpException(
        'Prisma no pudo iniciar el cliente (revisá DATABASE_URL, npx prisma generate en api y reinicio del proceso).',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return null;
  }

  async listReserveLines() {
    try {
      const rows = await this.prisma.workshopReserveLine.findMany({
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      });
      return rows.map((l) => this.serializeReserveLine(l));
    } catch (e) {
      const mapped = this.mapPrismaFailure(e);
      if (mapped) throw mapped;
      throw e;
    }
  }

  async createReserveLine(actorUserId: string, dto: CreateWorkshopReserveLineDto) {
    if (!Number.isFinite(dto.percent)) {
      throw new BadRequestException('Porcentaje inválido.');
    }
    try {
      const pct = new Prisma.Decimal(dto.percent);
      const row = await this.prisma.workshopReserveLine.create({
        data: {
          name: dto.name.trim(),
          percent: pct,
          sortOrder: dto.sortOrder ?? 0,
          isActive: dto.isActive ?? true,
        },
      });
      await this.audit.recordDomain({
        actorUserId,
        action: 'workshop_finance.reserve_line.created',
        entityType: 'WorkshopReserveLine',
        entityId: row.id,
        previousPayload: null,
        nextPayload: { name: row.name, percent: row.percent.toString(), sortOrder: row.sortOrder },
        ipAddress: null,
        userAgent: null,
      });
      return this.serializeReserveLine(row);
    } catch (e) {
      if (e instanceof HttpException) throw e;
      const mapped = this.mapPrismaFailure(e);
      if (mapped) throw mapped;
      throw e;
    }
  }

  async updateReserveLine(actorUserId: string, id: string, dto: UpdateWorkshopReserveLineDto) {
    if (dto.percent !== undefined && !Number.isFinite(dto.percent)) {
      throw new BadRequestException('Porcentaje inválido.');
    }
    try {
      const prev = await this.prisma.workshopReserveLine.findUnique({ where: { id } });
      if (!prev) throw new NotFoundException('Línea no encontrada');
      const row = await this.prisma.workshopReserveLine.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.percent !== undefined ? { percent: new Prisma.Decimal(dto.percent) } : {}),
          ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
      });
      await this.audit.recordDomain({
        actorUserId,
        action: 'workshop_finance.reserve_line.updated',
        entityType: 'WorkshopReserveLine',
        entityId: id,
        previousPayload: { name: prev.name, percent: prev.percent.toString(), isActive: prev.isActive },
        nextPayload: { name: row.name, percent: row.percent.toString(), isActive: row.isActive },
        ipAddress: null,
        userAgent: null,
      });
      return this.serializeReserveLine(row);
    } catch (e) {
      if (e instanceof HttpException) throw e;
      const mapped = this.mapPrismaFailure(e);
      if (mapped) throw mapped;
      throw e;
    }
  }

  /** Totales acumulados por línea (Σ aportes en cada cierre). */
  async reserveTotals() {
    try {
      /** Evitamos `groupBy` + `_sum`: en algunos entornos Prisma/PG lanza error y termina en 500. */
      const contributions = await this.prisma.cashSessionReserveContribution.findMany({
        select: { reserveLineId: true, contributionAmount: true },
      });
      const sums = new Map<string, Prisma.Decimal>();
      for (const c of contributions) {
        const prev = sums.get(c.reserveLineId) ?? new Prisma.Decimal(0);
        const add = c.contributionAmount ?? new Prisma.Decimal(0);
        sums.set(c.reserveLineId, prev.plus(add));
      }
      const lines = await this.prisma.workshopReserveLine.findMany({
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      });
      return lines.map((l) => ({
        line: this.serializeReserveLine(l),
        accumulatedCop: ceilWholeCop(sums.get(l.id) ?? new Prisma.Decimal(0)).toString(),
      }));
    } catch (e) {
      const mapped = this.mapPrismaFailure(e);
      if (mapped) throw mapped;
      throw e;
    }
  }

  async reserveContributionsHistory(take = 60) {
    try {
      const rows = await this.prisma.cashSessionReserveContribution.findMany({
        take: Math.min(take, 200),
        orderBy: { createdAt: 'desc' },
        include: {
          reserveLine: true,
          cashSession: {
            select: {
              id: true,
              closedAt: true,
              openedAt: true,
            },
          },
        },
      });
      return rows.map((r) => ({
        id: r.id,
        createdAt: r.createdAt.toISOString(),
        cashSessionId: r.cashSessionId,
        sessionClosedAt: r.cashSession?.closedAt ? r.cashSession.closedAt.toISOString() : null,
        lineName: r.reserveLine?.name ?? '(línea eliminada)',
        percentApplied: r.percentApplied.toString(),
        baseCashCounted: ceilWholeCop(r.baseCashCounted).toString(),
        contributionAmount: ceilWholeCop(r.contributionAmount).toString(),
      }));
    } catch (e) {
      const mapped = this.mapPrismaFailure(e);
      if (mapped) throw mapped;
      throw e;
    }
  }

  async listPayables() {
    try {
      const rows = await this.prisma.workshopPayable.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          createdBy: { select: { id: true, fullName: true, email: true } },
          payments: {
            orderBy: { createdAt: 'desc' },
            take: 20,
            include: {
              createdBy: { select: { id: true, fullName: true } },
            },
          },
        },
      });
      return rows.map((p) => this.serializePayableListRow(p));
    } catch (e) {
      const mapped = this.mapPrismaFailure(e);
      if (mapped) throw mapped;
      throw e;
    }
  }

  async createPayable(actorUserId: string, dto: CreateWorkshopPayableDto) {
    const initial = decimalFromMoneyApiString(dto.initialAmount);
    if (initial.lte(0)) throw new BadRequestException('El monto inicial debe ser mayor a cero');
    try {
      const row = await this.prisma.workshopPayable.create({
        data: {
          creditorName: dto.creditorName.trim(),
          description: dto.description?.trim() || null,
          initialAmount: initial,
          balanceAmount: initial,
          status: WorkshopPayableStatus.OPEN,
          createdById: actorUserId,
        },
      });
      await this.audit.recordDomain({
        actorUserId,
        action: 'workshop_finance.payable.created',
        entityType: 'WorkshopPayable',
        entityId: row.id,
        previousPayload: null,
        nextPayload: {
          creditorName: row.creditorName,
          initialAmount: row.initialAmount.toString(),
        },
        ipAddress: null,
        userAgent: null,
      });
      return this.serializePayableCreated(row);
    } catch (e) {
      if (e instanceof HttpException) throw e;
      const mapped = this.mapPrismaFailure(e);
      if (mapped) throw mapped;
      throw e;
    }
  }

  /** Quita del listado una deuda ya saldada; los movimientos de caja históricos no se borran. */
  async deleteSettledPayable(
    actorUserId: string,
    payableId: string,
    meta: { ip?: string; userAgent?: string },
  ): Promise<{ ok: true }> {
    const payable = await this.prisma.workshopPayable.findUnique({ where: { id: payableId } });
    if (!payable) throw new NotFoundException('Deuda no encontrada');
    if (payable.status !== WorkshopPayableStatus.SETTLED) {
      throw new ConflictException('Solo se pueden eliminar deudas ya saldadas.');
    }
    if (payable.balanceAmount.gt(0)) {
      throw new ConflictException('La deuda todavía tiene saldo pendiente.');
    }

    await this.prisma.workshopPayable.delete({ where: { id: payableId } });

    await this.audit.recordDomain({
      actorUserId,
      action: 'workshop_finance.payable.deleted_settled',
      entityType: 'WorkshopPayable',
      entityId: payableId,
      previousPayload: {
        creditorName: payable.creditorName,
        initialAmount: payable.initialAmount.toString(),
      },
      nextPayload: null,
      ipAddress: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    });

    return { ok: true };
  }

  async recordPayablePayment(
    actorUserId: string,
    payableId: string,
    dto: PayWorkshopPayableDto,
    meta: { ip?: string; userAgent?: string },
  ) {
    const payable = await this.prisma.workshopPayable.findUnique({ where: { id: payableId } });
    if (!payable) throw new NotFoundException('Deuda no encontrada');
    if (payable.status !== WorkshopPayableStatus.OPEN) throw new ConflictException('La deuda ya está saldada');

    const amt = decimalFromMoneyApiString(dto.amount);
    if (amt.lte(0)) throw new BadRequestException('El monto debe ser mayor a cero');
    if (amt.gt(payable.balanceAmount)) throw new BadRequestException('El monto supera el saldo pendiente');

    let category: { id: string; direction: CashMovementDirection } | null = null;
    if (dto.method === WorkshopPayablePaymentMethod.CASH) {
      await this.ensureExpensePrivilege(actorUserId);
      const quickOpen = await this.prisma.cashSession.findFirst({
        where: { status: CashSessionStatus.OPEN },
        select: { id: true },
      });
      if (!quickOpen) {
        throw new ConflictException(
          'No hay caja abierta: no se puede registrar un egreso en efectivo. Abrí caja o usá transferencia / otro medio.',
        );
      }
      const cat = await this.prisma.cashMovementCategory.findUnique({
        where: { slug: PAGO_DEUDA_CATEGORY_SLUG },
      });
      if (!cat || cat.direction !== CashMovementDirection.EXPENSE) {
        throw new BadRequestException(`Categoría "${PAGO_DEUDA_CATEGORY_SLUG}" no disponible`);
      }
      category = cat;
    }

    const noteOp = await this.notes.requireOperationalNote('Nota del pago de deuda', dto.note);

    if (dto.method === WorkshopPayablePaymentMethod.CASH) {
      const categoryId = category?.id;
      if (categoryId == null) {
        throw new BadRequestException(`Categoría "${PAGO_DEUDA_CATEGORY_SLUG}" no disponible`);
      }

      const result = await this.prisma.$transaction(async (tx) => {
        /** Dentro de la transacción: si cerraron la caja entre el chequeo previo y el POST, no egresar sobre sesión cerrada. */
        const liveSession = await tx.cashSession.findFirst({
          where: { status: CashSessionStatus.OPEN },
        });
        if (!liveSession) {
          throw new ConflictException(
            'La caja se cerró antes de confirmar el pago. Volvé a intentar con transferencia u otro medio, o abrí caja de nuevo.',
          );
        }
        const movement = await tx.cashMovement.create({
          data: {
            sessionId: liveSession.id,
            categoryId,
            direction: CashMovementDirection.EXPENSE,
            amount: amt,
            tenderAmount: null,
            changeAmount: null,
            referenceType: CASH_WORKSHOP_PAYABLE_PAYMENT_REF,
            referenceId: payableId,
            note: `${noteOp} · Deuda: ${payable.creditorName}`,
            createdById: actorUserId,
          },
        });
        const payment = await tx.workshopPayablePayment.create({
          data: {
            payableId,
            amount: amt,
            method: dto.method,
            cashMovementId: movement.id,
            note: noteOp,
            createdById: actorUserId,
          },
        });
        const newBal = payable.balanceAmount.sub(amt);
        await tx.workshopPayable.update({
          where: { id: payableId },
          data: {
            balanceAmount: newBal,
            status: newBal.lte(0) ? WorkshopPayableStatus.SETTLED : WorkshopPayableStatus.OPEN,
          },
        });
        return { movement, payment };
      });

      await this.audit.recordDomain({
        actorUserId,
        action: 'workshop_finance.payable.payment_cash',
        entityType: 'WorkshopPayable',
        entityId: payableId,
        previousPayload: { balance: payable.balanceAmount.toString() },
        nextPayload: {
          amount: amt.toString(),
          cashMovementId: result.movement.id,
          paymentId: result.payment.id,
        },
        ipAddress: meta.ip ?? null,
        userAgent: meta.userAgent ?? null,
      });

      const updated = await this.prisma.workshopPayable.findUnique({
        where: { id: payableId },
        include: {
          createdBy: { select: { id: true, fullName: true, email: true } },
          payments: {
            orderBy: { createdAt: 'desc' },
            take: 30,
            include: { createdBy: { select: { id: true, fullName: true } } },
          },
        },
      });
      if (!updated) throw new NotFoundException('Deuda no encontrada');
      return this.serializePayableListRow(updated);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.workshopPayablePayment.create({
        data: {
          payableId,
          amount: amt,
          method: dto.method,
          cashMovementId: null,
          note: noteOp,
          createdById: actorUserId,
        },
      });
      const newBal = payable.balanceAmount.sub(amt);
      await tx.workshopPayable.update({
        where: { id: payableId },
        data: {
          balanceAmount: newBal,
          status: newBal.lte(0) ? WorkshopPayableStatus.SETTLED : WorkshopPayableStatus.OPEN,
        },
      });
    });

    await this.audit.recordDomain({
      actorUserId,
      action: 'workshop_finance.payable.payment_transfer',
      entityType: 'WorkshopPayable',
      entityId: payableId,
      previousPayload: { balance: payable.balanceAmount.toString() },
      nextPayload: { amount: amt.toString(), method: dto.method },
      ipAddress: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    });

    const updated = await this.prisma.workshopPayable.findUnique({
      where: { id: payableId },
      include: {
        createdBy: { select: { id: true, fullName: true, email: true } },
        payments: {
          orderBy: { createdAt: 'desc' },
          take: 30,
          include: { createdBy: { select: { id: true, fullName: true } } },
        },
      },
    });
    if (!updated) throw new NotFoundException('Deuda no encontrada');
    return this.serializePayableListRow(updated);
  }

  private safeIso(d: Date, label: string): string {
    if (!(d instanceof Date) || Number.isNaN(d.getTime())) {
      this.logger.warn(`Fecha inválida en ${label}; usando instantánea UTC.`);
      return new Date().toISOString();
    }
    return d.toISOString();
  }

  private serializeReserveLine(l: {
    id: string;
    name: string;
    percent: Prisma.Decimal;
    sortOrder: number;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: l.id,
      name: l.name,
      percent: l.percent.toString(),
      sortOrder: l.sortOrder,
      isActive: l.isActive,
      createdAt: this.safeIso(l.createdAt, 'WorkshopReserveLine.createdAt'),
      updatedAt: this.safeIso(l.updatedAt, 'WorkshopReserveLine.updatedAt'),
    };
  }

  private serializePayableCreated(row: {
    id: string;
    creditorName: string;
    description: string | null;
    initialAmount: Prisma.Decimal;
    balanceAmount: Prisma.Decimal;
    status: WorkshopPayableStatus;
    createdById: string;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      creditorName: row.creditorName,
      description: row.description,
      initialAmount: row.initialAmount.toString(),
      balanceAmount: row.balanceAmount.toString(),
      status: row.status,
      createdById: row.createdById,
      createdAt: this.safeIso(row.createdAt, 'WorkshopPayable.createdAt'),
      updatedAt: this.safeIso(row.updatedAt, 'WorkshopPayable.updatedAt'),
    };
  }

  private serializePayableListRow(p: {
    id: string;
    creditorName: string;
    description: string | null;
    initialAmount: Prisma.Decimal;
    balanceAmount: Prisma.Decimal;
    status: WorkshopPayableStatus;
    createdAt: Date;
    updatedAt: Date;
    createdById: string;
    createdBy?: { id: string; fullName: string; email: string } | null;
    payments: Array<{
      id: string;
      amount: Prisma.Decimal;
      method: WorkshopPayablePaymentMethod;
      note: string | null;
      createdAt: Date;
      createdById: string;
      createdBy?: { id: string; fullName: string } | null;
    }>;
  }) {
    const createdBy =
      p.createdBy ??
      ({ id: p.createdById, fullName: '(usuario no encontrado)', email: '' });
    return {
      id: p.id,
      creditorName: p.creditorName,
      description: p.description,
      initialAmount: p.initialAmount.toString(),
      balanceAmount: p.balanceAmount.toString(),
      status: p.status,
      createdAt: this.safeIso(p.createdAt, 'WorkshopPayable.list.createdAt'),
      updatedAt: this.safeIso(p.updatedAt, 'WorkshopPayable.list.updatedAt'),
      createdBy,
      payments: p.payments.map((x) => ({
        id: x.id,
        amount: x.amount.toString(),
        method: x.method,
        note: x.note,
        createdAt: this.safeIso(x.createdAt, 'WorkshopPayablePayment.createdAt'),
        createdBy: x.createdBy ?? { id: x.createdById, fullName: '—' },
      })),
    };
  }
}
