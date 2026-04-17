/**
 * Sales service (Fase 3 — POS / mostrador).
 *
 * Responsabilidades:
 *   - Crear ventas de mostrador (`origin = COUNTER`) en borrador.
 *   - Facturar una OT entregada (`origin = WORK_ORDER`): copia líneas con snapshots
 *     fiscales, **sin** reconsumir inventario.
 *   - Confirmar venta de mostrador: descuenta stock de las líneas PART y genera
 *     movimientos `SALE_CONSUMPTION` (atomicidad + `FOR UPDATE` por ítem).
 *   - Confirmar venta derivada de OT: solo asigna `publicCode` y toma snapshots del cliente.
 *   - Cancelar venta sin pagos: reintegra stock (si aplicó) y registra auditoría.
 *   - Listado con filtros y detalle con desglose de totales reutilizando `billing-totals`.
 */
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  InventoryMovementType,
  Prisma,
  SaleLineType,
  SaleOrigin,
  SaleStatus,
  WorkOrderLineType,
  WorkOrderStatus,
} from '@prisma/client';
import {
  computeBillingTotals,
  computeLineTotals,
  serializeBillingTotals,
  serializeLineTotals,
  type LineForTotals,
} from '../../common/billing/billing-totals';
import { ceilWholeCop } from '../../common/money/cop-money';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { JwtUserPayload } from '../auth/types/jwt-user.payload';
import { INVENTORY_REF_SALE_LINE } from '../inventory/inventory.constants';
import type { CancelSaleDto } from './dto/cancel-sale.dto';
import type { CreateSaleDto } from './dto/create-sale.dto';
import type { CreateSaleFromWorkOrderDto } from './dto/create-sale-from-work-order.dto';
import type { ListSalesQueryDto } from './dto/list-sales.query.dto';
import type { UpdateSaleDto } from './dto/update-sale.dto';
import { formatSalePublicCode } from './sale-public-code';
import {
  actorMaySeeAllSales,
  actorMayViewSaleCosts,
  actorMayViewSaleFinancials,
} from './sales.visibility';

const userBrief = { select: { id: true, email: true, fullName: true } } as const;

const saleLineInclude = {
  inventoryItem: {
    select: {
      id: true,
      sku: true,
      name: true,
      itemKind: true,
      averageCost: true,
      measurementUnit: { select: { id: true, slug: true, name: true } },
    },
  },
  service: { select: { id: true, code: true, name: true } },
  taxRate: { select: { id: true, slug: true, name: true, kind: true, ratePercent: true } },
} as const;

const saleDetailInclude = {
  customer: { select: { id: true, displayName: true, documentId: true } },
  createdBy: userBrief,
  originWorkOrder: {
    select: {
      id: true,
      orderNumber: true,
      publicCode: true,
      status: true,
    },
  },
  lines: { orderBy: { sortOrder: 'asc' as const }, include: saleLineInclude },
  payments: {
    orderBy: { createdAt: 'desc' as const },
    include: { recordedBy: userBrief, cashMovement: { include: { category: true } } },
  },
} satisfies Prisma.SaleInclude;

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Convierte una venta cargada con `saleDetailInclude` en la forma que espera la UI:
   *   - Agrega `totals` por línea y agregados.
   *   - Redacta importes si el actor no tiene `sales:view_financials`.
   *   - Oculta costo/utilidad salvo `reports:read`.
   */
  private shapeSaleForActor(
    sale: Prisma.SaleGetPayload<{ include: typeof saleDetailInclude }>,
    actor: JwtUserPayload,
  ) {
    const mayFinancials = actorMayViewSaleFinancials(actor);
    const mayCosts = actorMayViewSaleCosts(actor);

    const linesForTotals: LineForTotals[] = sale.lines.map((ln) => ({
      id: ln.id,
      // El motor usa WorkOrderLineType como discriminador; mapeamos 1:1 los valores homónimos.
      lineType:
        ln.lineType === SaleLineType.LABOR ? WorkOrderLineType.LABOR : WorkOrderLineType.PART,
      quantity: ln.quantity,
      unitPrice: ln.unitPrice,
      discountAmount: ln.discountAmount,
      costSnapshot: ln.costSnapshot,
      taxRateId: ln.taxRateId,
      taxRatePercentSnapshot: ln.taxRatePercentSnapshot,
      taxRate: ln.taxRate ? { kind: ln.taxRate.kind } : null,
    }));

    const totals = computeBillingTotals(linesForTotals);
    const linesWithTotals = sale.lines.map((ln, idx) => ({
      ...ln,
      totals: serializeLineTotals(computeLineTotals(linesForTotals[idx])),
    }));

    // Importe ya cobrado a partir de SalePayment (para mostrar saldo pendiente).
    const totalPaidDec = sale.payments.reduce(
      (acc, p) => acc.plus(p.amount),
      new Prisma.Decimal(0),
    );
    const grandTotalCeiled = ceilWholeCop(totals.grandTotal);
    const amountDueDec = grandTotalCeiled.minus(totalPaidDec);
    const amountDue = amountDueDec.lt(0) ? '0' : ceilWholeCop(amountDueDec).toString();

    const totalsSerialized = serializeBillingTotals(totals);
    const totalsForActor = mayCosts
      ? totalsSerialized
      : { ...totalsSerialized, totalCost: null, totalProfit: null };

    const base = {
      ...sale,
      lines: linesWithTotals,
      totals: totalsForActor,
      linesSubtotal: ceilWholeCop(totals.linesSubtotal).toString(),
      amountDue,
      paymentSummary: {
        paymentCount: sale.payments.length,
        totalPaid: totalPaidDec.toString(),
        remaining: amountDue,
      },
    };

    if (mayFinancials) return base;

    return {
      ...base,
      totals: null,
      linesSubtotal: null,
      amountDue: null,
      lines: linesWithTotals.map((ln) => ({
        ...ln,
        unitPrice: null,
        discountAmount: null,
        costSnapshot: null,
        totals: null,
        inventoryItem: ln.inventoryItem ? { ...ln.inventoryItem, averageCost: null } : null,
      })),
      payments: sale.payments.map((p) => ({ ...p, amount: null })) as unknown as typeof sale.payments,
      paymentSummary: { paymentCount: sale.payments.length, totalPaid: null, remaining: null },
    };
  }

  /** Visibilidad: `sales:read_all` ve todo; sin él, solo ventas creadas por el actor. */
  private visibilityWhere(actor: JwtUserPayload): Prisma.SaleWhereInput {
    if (actorMaySeeAllSales(actor)) return {};
    return { createdById: actor.sub };
  }

  async assertSaleVisible(actor: JwtUserPayload, saleId: string): Promise<void> {
    const sale = await this.prisma.sale.findFirst({
      where: { id: saleId, ...this.visibilityWhere(actor) },
      select: { id: true },
    });
    if (!sale) {
      throw new NotFoundException('Venta no encontrada');
    }
  }

  // ---------------------------------------------------------------------------
  // Listado / detalle
  // ---------------------------------------------------------------------------

  async list(actor: JwtUserPayload, query: ListSalesQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.SaleWhereInput = {
      ...this.visibilityWhere(actor),
      ...(query.status ? { status: query.status } : {}),
      ...(query.origin ? { origin: query.origin } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.publicCode ? { publicCode: { contains: query.publicCode, mode: 'insensitive' } } : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.sale.count({ where }),
      this.prisma.sale.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          customer: { select: { id: true, displayName: true } },
          createdBy: userBrief,
          _count: { select: { lines: true, payments: true } },
        },
      }),
    ]);
    const mayFinancials = actorMayViewSaleFinancials(actor);
    return {
      page,
      pageSize,
      total,
      items: rows.map((r) =>
        mayFinancials ? r : { ...r, /* sin importes en línea aún; lista no los trae */ },
      ),
    };
  }

  async findOne(id: string, actor: JwtUserPayload) {
    const sale = await this.prisma.sale.findFirst({
      where: { id, ...this.visibilityWhere(actor) },
      include: saleDetailInclude,
    });
    if (!sale) {
      throw new NotFoundException('Venta no encontrada');
    }
    return this.shapeSaleForActor(sale, actor);
  }

  // ---------------------------------------------------------------------------
  // Creación (mostrador)
  // ---------------------------------------------------------------------------

  async create(
    actor: JwtUserPayload,
    dto: CreateSaleDto,
    meta: { ip?: string; userAgent?: string },
  ) {
    // Si viene customerId, validar existencia (no inventamos datos).
    if (dto.customerId) {
      const cust = await this.prisma.customer.findUnique({ where: { id: dto.customerId } });
      if (!cust || !cust.isActive) {
        throw new NotFoundException('Cliente no encontrado o inactivo');
      }
    }

    // Crear con publicCode calculado a partir del número auto asignado.
    const sale = await this.prisma.$transaction(async (tx) => {
      const created = await tx.sale.create({
        data: {
          origin: SaleOrigin.COUNTER,
          status: SaleStatus.DRAFT,
          // placeholder; lo actualizamos en el mismo tx con el número definitivo.
          publicCode: 'PENDING',
          customerId: dto.customerId ?? null,
          customerName: dto.customerName?.trim() || null,
          customerDocumentId: dto.customerDocumentId?.trim() || null,
          customerPhone: dto.customerPhone?.trim() || null,
          customerEmail: dto.customerEmail?.trim() || null,
          internalNotes: dto.internalNotes?.trim() || null,
          createdById: actor.sub,
        },
      });
      return tx.sale.update({
        where: { id: created.id },
        data: { publicCode: formatSalePublicCode(created.saleNumber) },
        include: saleDetailInclude,
      });
    });

    await this.audit.recordDomain({
      actorUserId: actor.sub,
      action: 'sales.created',
      entityType: 'Sale',
      entityId: sale.id,
      previousPayload: null,
      nextPayload: {
        origin: sale.origin,
        publicCode: sale.publicCode,
        customerId: sale.customerId,
      },
      ipAddress: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    });

    return this.shapeSaleForActor(sale, actor);
  }

  // ---------------------------------------------------------------------------
  // Creación desde OT entregada
  // ---------------------------------------------------------------------------

  async createFromWorkOrder(
    actor: JwtUserPayload,
    dto: CreateSaleFromWorkOrderDto,
    meta: { ip?: string; userAgent?: string },
  ) {
    const sale = await this.prisma.$transaction(async (tx) => {
      const wo = await tx.workOrder.findUnique({
        where: { id: dto.workOrderId },
        include: {
          lines: true,
          sale: { select: { id: true } },
          vehicle: { select: { customerId: true } },
        },
      });
      if (!wo) throw new NotFoundException('Orden de trabajo no encontrada');
      if (wo.status !== WorkOrderStatus.DELIVERED) {
        throw new ConflictException(
          'Solo se puede facturar una orden entregada. Si está en proceso, cobrá desde la OT.',
        );
      }
      if (wo.sale) {
        throw new ConflictException('Esta orden ya tiene una venta emitida');
      }

      const created = await tx.sale.create({
        data: {
          origin: SaleOrigin.WORK_ORDER,
          status: SaleStatus.DRAFT,
          publicCode: 'PENDING',
          originWorkOrderId: wo.id,
          customerId: wo.vehicle?.customerId ?? null,
          // Snapshots del cliente: preferimos lo que venga del DTO, si no, lo de la OT.
          customerName: (dto.customerName ?? wo.customerName)?.trim() || null,
          customerDocumentId: dto.customerDocumentId?.trim() || null,
          customerPhone: (dto.customerPhone ?? wo.customerPhone)?.trim() || null,
          customerEmail: (dto.customerEmail ?? wo.customerEmail)?.trim() || null,
          internalNotes: dto.internalNotes?.trim() || null,
          createdById: actor.sub,
        },
      });

      // Copiamos las líneas con todos los snapshots. NO tocamos inventario.
      if (wo.lines.length > 0) {
        await tx.saleLine.createMany({
          data: wo.lines.map((ln, idx) => ({
            saleId: created.id,
            lineType:
              ln.lineType === WorkOrderLineType.LABOR ? SaleLineType.LABOR : SaleLineType.PART,
            sortOrder: ln.sortOrder ?? idx,
            inventoryItemId: ln.inventoryItemId,
            serviceId: ln.serviceId,
            taxRateId: ln.taxRateId,
            description: ln.description,
            quantity: ln.quantity,
            unitPrice: ln.unitPrice,
            discountAmount: ln.discountAmount,
            costSnapshot: ln.costSnapshot,
            taxRatePercentSnapshot: ln.taxRatePercentSnapshot,
          })),
        });
      }

      return tx.sale.update({
        where: { id: created.id },
        data: { publicCode: formatSalePublicCode(created.saleNumber) },
        include: saleDetailInclude,
      });
    });

    await this.audit.recordDomain({
      actorUserId: actor.sub,
      action: 'sales.created_from_work_order',
      entityType: 'Sale',
      entityId: sale.id,
      previousPayload: null,
      nextPayload: {
        origin: sale.origin,
        publicCode: sale.publicCode,
        workOrderId: sale.originWorkOrderId,
        lineCount: sale.lines.length,
      },
      ipAddress: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    });

    return this.shapeSaleForActor(sale, actor);
  }

  // ---------------------------------------------------------------------------
  // Edición de cabecera (solo borrador)
  // ---------------------------------------------------------------------------

  async update(
    id: string,
    actor: JwtUserPayload,
    dto: UpdateSaleDto,
    meta: { ip?: string; userAgent?: string },
  ) {
    await this.assertSaleVisible(actor, id);
    const keys = Object.keys(dto).filter((k) => dto[k as keyof UpdateSaleDto] !== undefined);
    if (keys.length === 0) {
      throw new BadRequestException('No hay campos para actualizar');
    }

    const sale = await this.prisma.$transaction(async (tx) => {
      const before = await tx.sale.findUnique({ where: { id } });
      if (!before) throw new NotFoundException('Venta no encontrada');
      if (before.status !== SaleStatus.DRAFT) {
        throw new ConflictException('Solo se pueden editar ventas en borrador');
      }
      if (dto.customerId) {
        const cust = await tx.customer.findUnique({ where: { id: dto.customerId } });
        if (!cust || !cust.isActive) {
          throw new NotFoundException('Cliente no encontrado o inactivo');
        }
      }
      const toNullable = (v: string | null | undefined) =>
        v === undefined ? undefined : v === null ? null : v.trim() || null;
      return tx.sale.update({
        where: { id },
        data: {
          customerId: dto.customerId === undefined ? undefined : dto.customerId,
          customerName: toNullable(dto.customerName),
          customerDocumentId: toNullable(dto.customerDocumentId),
          customerPhone: toNullable(dto.customerPhone),
          customerEmail: toNullable(dto.customerEmail),
          internalNotes: toNullable(dto.internalNotes),
        },
        include: saleDetailInclude,
      });
    });

    await this.audit.recordDomain({
      actorUserId: actor.sub,
      action: 'sales.updated',
      entityType: 'Sale',
      entityId: id,
      previousPayload: null,
      nextPayload: { fields: keys },
      ipAddress: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    });

    return this.shapeSaleForActor(sale, actor);
  }

  // ---------------------------------------------------------------------------
  // Confirmación
  // ---------------------------------------------------------------------------

  async confirm(
    id: string,
    actor: JwtUserPayload,
    meta: { ip?: string; userAgent?: string },
  ) {
    await this.assertSaleVisible(actor, id);

    const sale = await this.prisma.$transaction(async (tx) => {
      // Lock la venta para evitar que dos confirmaciones choquen con el stock.
      await tx.$executeRaw(Prisma.sql`SELECT id FROM "sales" WHERE id = ${id} FOR UPDATE`);

      const before = await tx.sale.findUnique({
        where: { id },
        include: { lines: { include: { inventoryItem: true } } },
      });
      if (!before) throw new NotFoundException('Venta no encontrada');
      if (before.status !== SaleStatus.DRAFT) {
        throw new ConflictException('La venta ya fue confirmada o anulada');
      }
      if (before.lines.length === 0) {
        throw new BadRequestException('No se puede confirmar una venta sin líneas');
      }

      // Solo las ventas de mostrador consumen inventario: las que vienen de OT ya lo hicieron.
      if (before.origin === SaleOrigin.COUNTER) {
        for (const ln of before.lines) {
          if (ln.lineType !== SaleLineType.PART || !ln.inventoryItemId) continue;
          await tx.$executeRaw(
            Prisma.sql`SELECT id FROM "inventory_items" WHERE id = ${ln.inventoryItemId} FOR UPDATE`,
          );
          const item = await tx.inventoryItem.findUniqueOrThrow({
            where: { id: ln.inventoryItemId },
          });
          if (!item.isActive || !item.trackStock) {
            throw new BadRequestException(
              `El ítem ${item.sku} ya no está disponible para venta (desactivado o sin stock).`,
            );
          }
          if (item.quantityOnHand.lt(ln.quantity)) {
            throw new BadRequestException(
              `Stock insuficiente para ${item.sku} (disponible ${item.quantityOnHand.toString()}, requerido ${ln.quantity.toString()}).`,
            );
          }
          await tx.inventoryItem.update({
            where: { id: item.id },
            data: { quantityOnHand: item.quantityOnHand.minus(ln.quantity) },
          });
          await tx.inventoryMovement.create({
            data: {
              inventoryItemId: item.id,
              quantityChange: ln.quantity.neg(),
              movementType: InventoryMovementType.SALE_CONSUMPTION,
              referenceType: INVENTORY_REF_SALE_LINE,
              referenceId: ln.id,
              createdById: actor.sub,
            },
          });
        }
      }

      return tx.sale.update({
        where: { id },
        data: {
          status: SaleStatus.CONFIRMED,
          confirmedAt: new Date(),
        },
        include: saleDetailInclude,
      });
    });

    await this.audit.recordDomain({
      actorUserId: actor.sub,
      action: 'sales.confirmed',
      entityType: 'Sale',
      entityId: id,
      previousPayload: { status: SaleStatus.DRAFT },
      nextPayload: {
        status: SaleStatus.CONFIRMED,
        origin: sale.origin,
        publicCode: sale.publicCode,
      },
      ipAddress: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    });

    return this.shapeSaleForActor(sale, actor);
  }

  // ---------------------------------------------------------------------------
  // Cancelación
  // ---------------------------------------------------------------------------

  async cancel(
    id: string,
    actor: JwtUserPayload,
    dto: CancelSaleDto,
    meta: { ip?: string; userAgent?: string },
  ) {
    await this.assertSaleVisible(actor, id);
    const reason = dto.reason.trim();
    if (reason.length < 10) {
      throw new BadRequestException('La razón de cancelación debe tener al menos 10 caracteres');
    }

    const sale = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`SELECT id FROM "sales" WHERE id = ${id} FOR UPDATE`);
      const before = await tx.sale.findUnique({
        where: { id },
        include: { lines: true, payments: { select: { id: true } } },
      });
      if (!before) throw new NotFoundException('Venta no encontrada');
      if (before.status === SaleStatus.CANCELLED) {
        throw new ConflictException('La venta ya estaba anulada');
      }
      if (before.payments.length > 0) {
        throw new ConflictException(
          'No se puede anular una venta con cobros. Registrá una nota crédito desde administración.',
        );
      }

      // Si la venta ya había descontado stock (CONFIRMED y origen COUNTER), reintegramos.
      if (before.status === SaleStatus.CONFIRMED && before.origin === SaleOrigin.COUNTER) {
        for (const ln of before.lines) {
          if (ln.lineType !== SaleLineType.PART || !ln.inventoryItemId) continue;
          await tx.$executeRaw(
            Prisma.sql`SELECT id FROM "inventory_items" WHERE id = ${ln.inventoryItemId} FOR UPDATE`,
          );
          const item = await tx.inventoryItem.findUniqueOrThrow({
            where: { id: ln.inventoryItemId },
          });
          await tx.inventoryItem.update({
            where: { id: item.id },
            data: { quantityOnHand: item.quantityOnHand.plus(ln.quantity) },
          });
          await tx.inventoryMovement.create({
            data: {
              inventoryItemId: item.id,
              quantityChange: ln.quantity,
              movementType: InventoryMovementType.ADJUSTMENT_IN,
              referenceType: INVENTORY_REF_SALE_LINE,
              referenceId: ln.id,
              note: 'Reversión por anulación de venta',
              createdById: actor.sub,
            },
          });
        }
      }

      return tx.sale.update({
        where: { id },
        data: {
          status: SaleStatus.CANCELLED,
          cancelledAt: new Date(),
          cancelledReason: reason,
        },
        include: saleDetailInclude,
      });
    });

    await this.audit.recordDomain({
      actorUserId: actor.sub,
      action: 'sales.cancelled',
      entityType: 'Sale',
      entityId: id,
      previousPayload: null,
      nextPayload: {
        status: SaleStatus.CANCELLED,
        reason,
        origin: sale.origin,
      },
      ipAddress: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    });

    return this.shapeSaleForActor(sale, actor);
  }
}
