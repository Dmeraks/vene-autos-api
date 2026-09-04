/**
 * Líneas de OT: repuesto (consume stock) o mano de obra (importe al cliente, sin inventario).
 */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  InventoryMovementType,
  Prisma,
  WorkOrderLineType,
  WorkOrderStatus,
} from '@prisma/client';
import { ceilWholeCop, decimalFromMoneyApiString } from '../../common/money/cop-money';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { JwtUserPayload } from '../auth/types/jwt-user.payload';
import {
  INVENTORY_REF_WORK_ORDER_LINE,
  allowsFractionalWorkOrderPartQuantity,
} from '../inventory/inventory.constants';
import {
  assertOtQuantityWholeQuartersForOilGallon,
  inventoryItemUsesQuarterGallonOtQuantity,
  oilOtQuarterUnitPriceToStoredGallonUnitPrice,
  otPartQuantityToInventoryGallons,
} from '../inventory/oil-gallon-ot';
import type { CreateWorkOrderLineDto } from './dto/create-work-order-line.dto';
import type { UpdateWorkOrderLineDto } from './dto/update-work-order-line.dto';
import { WorkOrdersService } from './work-orders.service';
import {
  actorMayViewWorkOrderCosts,
  actorMayViewWorkOrderFinancials,
} from './work-orders.visibility';
import {
  computeLineTotals,
  computeWorkOrderTotals,
  serializeLineTotals,
  serializeWorkOrderTotals,
  type LineForTotals,
} from './work-order-totals';

/** Solo estos perfiles pueden editar o quitar líneas PART (repuesto) ya agregadas a la OT. */
const WORK_ORDER_PART_LINE_MANAGER_ROLE_SLUGS = new Set([
  'cajero',
  'cajero_autorizado',
  'administrador',
  'dueno',
])

const lineInclude = {
  inventoryItem: {
    include: { measurementUnit: { select: { id: true, slug: true, name: true } } },
  },
  taxRate: { select: { id: true, slug: true, name: true, kind: true, ratePercent: true } },
  service: { select: { id: true, code: true, name: true } },
} as const;

function assertPartQuantityMatchesMeasurementUnit(qty: Prisma.Decimal, measurementUnitSlug: string): void {
  if (allowsFractionalWorkOrderPartQuantity(measurementUnitSlug)) {
    return;
  }
  const remainder = qty.minus(qty.floor());
  if (!remainder.isZero()) {
    throw new BadRequestException(
      'Este repuesto se cuenta por unidad entera (no se permiten decimales). Para fluidos usá un ítem con unidad Litro o Galón.',
    );
  }
}

@Injectable()
export class WorkOrderLinesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly workOrders: WorkOrdersService,
  ) {}

  /**
   * Técnicos pueden agregar repuestos y editar mano de obra; no alterar líneas PART ya cargadas
   * (cantidad/precio/quitar) salvo cajero, administrador o dueño.
   */
  /** Quien ve importes en OT y puede fijar o cambiar `unitPrice` en líneas (técnicos no). */
  private redactLineForActor<T extends { unitPrice: unknown; inventoryItem: unknown; totals?: unknown }>(
    actor: JwtUserPayload,
    line: T,
  ): T {
    if (actorMayViewWorkOrderFinancials(actor)) {
      return line;
    }
    const inv = line.inventoryItem as { averageCost?: unknown } | null;
    return {
      ...line,
      unitPrice: null,
      totals: null,
      inventoryItem: inv ? { ...inv, averageCost: null } : null,
    } as T;
  }

  private async assertWorkOrderPartLineManagersOnly(actor: JwtUserPayload, lineType: WorkOrderLineType): Promise<void> {
    if (lineType !== WorkOrderLineType.PART) return

    const previewSlug = actor.previewRole?.slug
    if (previewSlug) {
      if (!WORK_ORDER_PART_LINE_MANAGER_ROLE_SLUGS.has(previewSlug)) {
        throw new ForbiddenException(
          'Solo cajero, administrador o dueño pueden modificar o quitar repuestos ya cargados en la orden.',
        )
      }
      return
    }

    const rows = await this.prisma.userRole.findMany({
      where: { userId: actor.sub },
      include: { role: { select: { slug: true } } },
    })
    const ok = rows.some((r) => WORK_ORDER_PART_LINE_MANAGER_ROLE_SLUGS.has(r.role.slug))
    if (!ok) {
      throw new ForbiddenException(
        'Solo cajero, administrador o dueño pueden modificar o quitar repuestos ya cargados en la orden.',
      )
    }
  }

  async list(workOrderId: string, actor: JwtUserPayload) {
    await this.workOrders.assertWorkOrderVisible(actor, workOrderId);
    const rows = await this.prisma.workOrderLine.findMany({
      where: { workOrderId },
      orderBy: { sortOrder: 'asc' },
      include: lineInclude,
    });
    const mayFin = actorMayViewWorkOrderFinancials(actor);
    return rows.map((ln) => {
      if (!mayFin) {
        return this.redactLineForActor(actor, ln);
      }
      const linesForTotals: LineForTotals = {
        id: ln.id,
        lineType: ln.lineType,
        quantity: ln.quantity,
        unitPrice: ln.unitPrice,
        discountAmount: ln.discountAmount,
        costSnapshot: ln.costSnapshot,
        taxRateId: ln.taxRateId,
        taxRatePercentSnapshot: ln.taxRatePercentSnapshot,
        taxRate: ln.taxRate ? { kind: ln.taxRate.kind } : null,
      };
      return this.redactLineForActor(actor, {
        ...ln,
        totals: serializeLineTotals(computeLineTotals(linesForTotals)),
      });
    });
  }

  /**
   * Devuelve el desglose oficial de la OT (Fase 2): subtotal bruto, descuento, IVA/INC,
   * total a cobrar, costo y utilidad si corresponde. Mantiene el campo `subtotal` por
   * compatibilidad con los consumidores actuales (suma bruta antes de impuestos).
   */
  async subtotal(workOrderId: string, actor: JwtUserPayload) {
    if (!actorMayViewWorkOrderFinancials(actor)) {
      throw new ForbiddenException(
        'No tenés permiso para consultar importes de la orden. Pedile a caja o administración.',
      );
    }
    await this.workOrders.assertWorkOrderVisible(actor, workOrderId);
    const lines = await this.prisma.workOrderLine.findMany({
      where: { workOrderId },
      select: {
        id: true,
        lineType: true,
        quantity: true,
        unitPrice: true,
        discountAmount: true,
        costSnapshot: true,
        taxRateId: true,
        taxRatePercentSnapshot: true,
        taxRate: { select: { kind: true } },
      },
    });
    const totals = computeWorkOrderTotals(
      lines.map((ln) => ({
        id: ln.id,
        lineType: ln.lineType,
        quantity: ln.quantity,
        unitPrice: ln.unitPrice,
        discountAmount: ln.discountAmount,
        costSnapshot: ln.costSnapshot,
        taxRateId: ln.taxRateId,
        taxRatePercentSnapshot: ln.taxRatePercentSnapshot,
        taxRate: ln.taxRate ? { kind: ln.taxRate.kind } : null,
      })),
    );
    const serialized = serializeWorkOrderTotals(totals);
    const mayViewCosts = actorMayViewWorkOrderCosts(actor);
    return {
      workOrderId,
      subtotal: ceilWholeCop(totals.linesSubtotal).toString(),
      ...serialized,
      totalCost: mayViewCosts ? serialized.totalCost : null,
      totalProfit: mayViewCosts ? serialized.totalProfit : null,
    };
  }

  async create(
    workOrderId: string,
    actor: JwtUserPayload,
    dto: CreateWorkOrderLineDto,
    meta: { ip?: string; userAgent?: string },
  ) {
    if (dto.lineType === WorkOrderLineType.PART) {
      if (!dto.inventoryItemId) {
        throw new BadRequestException('La línea PART requiere inventoryItemId');
      }
      if (dto.serviceId) {
        throw new BadRequestException('La línea PART no admite serviceId (los servicios son LABOR)');
      }
    } else {
      if (!dto.description?.trim() && !dto.serviceId) {
        throw new BadRequestException('La línea LABOR requiere descripción o un servicio del catálogo');
      }
      if (dto.inventoryItemId) {
        throw new BadRequestException('La línea LABOR no admite inventoryItemId');
      }
    }

    const qty = new Prisma.Decimal(dto.quantity);
    if (qty.lte(0)) {
      throw new BadRequestException('La cantidad debe ser mayor a cero');
    }

    await this.workOrders.assertWorkOrderVisible(actor, workOrderId);

    // Validar referencias opcionales (servicio / tarifa) antes de abrir la transacción
    let resolvedServiceDescription: string | null = null;
    let resolvedServiceUnitPrice: Prisma.Decimal | null = null;
    let resolvedServiceTaxRateId: string | null = null;
    if (dto.serviceId) {
      const svc = await this.prisma.service.findUnique({ where: { id: dto.serviceId } });
      if (!svc) throw new NotFoundException('Servicio no encontrado');
      if (!svc.isActive) {
        throw new BadRequestException('El servicio seleccionado está desactivado');
      }
      resolvedServiceDescription = svc.name;
      resolvedServiceUnitPrice = svc.defaultUnitPrice ?? null;
      resolvedServiceTaxRateId = svc.defaultTaxRateId ?? null;
    }
    // Resolvemos el snapshot del porcentaje (puede venir por taxRateId explícito o por el default del servicio)
    const effectiveTaxRateId = dto.taxRateId ?? resolvedServiceTaxRateId ?? null;
    let taxRatePercentSnapshotForSave: Prisma.Decimal | null = null;
    if (effectiveTaxRateId) {
      const tax = await this.prisma.taxRate.findUnique({ where: { id: effectiveTaxRateId } });
      if (!tax) throw new NotFoundException('Tarifa de impuesto no encontrada');
      if (!tax.isActive) {
        throw new BadRequestException('La tarifa de impuesto seleccionada está desactivada');
      }
      taxRatePercentSnapshotForSave = tax.ratePercent;
    }

    const mayFinancials = actorMayViewWorkOrderFinancials(actor);
    let unitPriceForSave =
      mayFinancials && dto.unitPrice?.trim()
        ? decimalFromMoneyApiString(dto.unitPrice)
        : mayFinancials && resolvedServiceUnitPrice
          ? resolvedServiceUnitPrice
          : null

    const discountForSave =
      mayFinancials && dto.discountAmount?.trim()
        ? decimalFromMoneyApiString(dto.discountAmount)
        : null

    const taxRateIdForSave = dto.taxRateId ?? resolvedServiceTaxRateId ?? null

    const line = await this.prisma.$transaction(async (tx) => {
      await this.lockWorkOrder(tx, workOrderId);
      await this.assertWorkOrderEditable(tx, workOrderId);

      const sortOrder = await this.nextSortOrder(tx, workOrderId);

      if (dto.lineType === WorkOrderLineType.LABOR) {
        const descriptionForSave =
          dto.description?.trim() || resolvedServiceDescription || '';
        return tx.workOrderLine.create({
          data: {
            workOrderId,
            lineType: WorkOrderLineType.LABOR,
            sortOrder,
            inventoryItemId: null,
            serviceId: dto.serviceId ?? null,
            taxRateId: taxRateIdForSave,
            taxRatePercentSnapshot: taxRatePercentSnapshotForSave,
            description: descriptionForSave,
            quantity: qty,
            unitPrice: unitPriceForSave,
            discountAmount: discountForSave,
          },
          include: lineInclude,
        });
      }

      await tx.$executeRaw(
        Prisma.sql`SELECT id FROM "inventory_items" WHERE id = ${dto.inventoryItemId!} FOR UPDATE`,
      );
      const item = await tx.inventoryItem.findUnique({
        where: { id: dto.inventoryItemId! },
        include: { measurementUnit: { select: { slug: true } } },
      });
      if (!item || !item.isActive) {
        throw new NotFoundException('Ítem de inventario no encontrado');
      }
      if (!item.trackStock) {
        throw new BadRequestException('Este ítem no descuenta stock');
      }
      if (unitPriceForSave !== null && inventoryItemUsesQuarterGallonOtQuantity(item)) {
        unitPriceForSave = oilOtQuarterUnitPriceToStoredGallonUnitPrice(unitPriceForSave);
      }
      assertOtQuantityWholeQuartersForOilGallon(qty, item);
      const consumptionGallons = otPartQuantityToInventoryGallons(qty, item);
      assertPartQuantityMatchesMeasurementUnit(consumptionGallons, item.measurementUnit.slug);
      if (item.quantityOnHand.lt(consumptionGallons)) {
        throw new BadRequestException('Stock insuficiente para la cantidad solicitada');
      }

      const created = await tx.workOrderLine.create({
        data: {
          workOrderId,
          lineType: WorkOrderLineType.PART,
          sortOrder,
          inventoryItemId: item.id,
          taxRateId: taxRateIdForSave,
          taxRatePercentSnapshot: taxRatePercentSnapshotForSave,
          description: dto.description?.trim() ?? null,
          quantity: consumptionGallons,
          unitPrice: unitPriceForSave,
          discountAmount: discountForSave,
          /** Copia del costo medio actual; si luego cambia, la OT mantiene el margen real. */
          costSnapshot: item.averageCost ?? null,
        },
        include: lineInclude,
      });

      await tx.inventoryItem.update({
        where: { id: item.id },
        data: { quantityOnHand: item.quantityOnHand.minus(consumptionGallons) },
      });

      await tx.inventoryMovement.create({
        data: {
          inventoryItemId: item.id,
          quantityChange: consumptionGallons.neg(),
          movementType: InventoryMovementType.WORK_ORDER_CONSUMPTION,
          referenceType: INVENTORY_REF_WORK_ORDER_LINE,
          referenceId: created.id,
          createdById: actor.sub,
        },
      });

      return created;
    });

    await this.audit.recordDomain({
      actorUserId: actor.sub,
      action: 'work_order_lines.created',
      entityType: 'WorkOrderLine',
      entityId: line.id,
      previousPayload: null,
      nextPayload: { workOrderId, lineType: line.lineType, quantity: dto.quantity },
      ipAddress: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    });

    return this.redactLineForActor(actor, line);
  }

  async update(
    workOrderId: string,
    lineId: string,
    actor: JwtUserPayload,
    dto: UpdateWorkOrderLineDto,
    meta: { ip?: string; userAgent?: string },
  ) {
    const keys = Object.keys(dto).filter((k) => dto[k as keyof UpdateWorkOrderLineDto] !== undefined);
    if (keys.length === 0) {
      throw new BadRequestException('No hay campos para actualizar');
    }

    if (
      (dto.unitPrice !== undefined || dto.discountAmount !== undefined) &&
      !actorMayViewWorkOrderFinancials(actor)
    ) {
      throw new ForbiddenException(
        'No tenés permiso para cargar o cambiar importes en líneas de orden. Pedile a caja o administración.',
      )
    }

    // Si el cambio incluye tarifa de impuesto, calculamos el nuevo snapshot %.
    // - undefined  → no tocamos snapshot.
    // - null       → limpiamos tasa y snapshot.
    // - string id  → validamos tasa, activa, y guardamos su ratePercent actual.
    let taxRatePercentSnapshotPatch: Prisma.Decimal | null | undefined = undefined;
    if (dto.taxRateId === null) {
      taxRatePercentSnapshotPatch = null;
    } else if (dto.taxRateId !== undefined) {
      const tax = await this.prisma.taxRate.findUnique({ where: { id: dto.taxRateId } });
      if (!tax) throw new NotFoundException('Tarifa de impuesto no encontrada');
      if (!tax.isActive) {
        throw new BadRequestException('La tarifa de impuesto seleccionada está desactivada');
      }
      taxRatePercentSnapshotPatch = tax.ratePercent;
    }
    if (dto.serviceId !== undefined && dto.serviceId !== null) {
      const svc = await this.prisma.service.findUnique({ where: { id: dto.serviceId } });
      if (!svc) throw new NotFoundException('Servicio no encontrado');
      if (!svc.isActive) {
        throw new BadRequestException('El servicio seleccionado está desactivado');
      }
    }

    await this.workOrders.assertWorkOrderVisible(actor, workOrderId);

    const updated = await this.prisma.$transaction(async (tx) => {
      await this.lockWorkOrder(tx, workOrderId);
      await this.assertWorkOrderEditable(tx, workOrderId);

      const before = await tx.workOrderLine.findFirst({
        where: { id: lineId, workOrderId },
        include: {
          inventoryItem: { include: { measurementUnit: { select: { slug: true } } } },
        },
      });
      if (!before) {
        throw new NotFoundException('Línea no encontrada en esta orden')
      }

      await this.assertWorkOrderPartLineManagersOnly(actor, before.lineType)

      let quantityPatch: Prisma.Decimal | undefined;
      if (dto.quantity !== undefined) {
        const rawQty = new Prisma.Decimal(dto.quantity);
        if (rawQty.lte(0)) {
          throw new BadRequestException('La cantidad debe ser mayor a cero');
        }
        let newStoredQty = rawQty;
        if (before.lineType === WorkOrderLineType.PART && before.inventoryItemId && before.inventoryItem) {
          assertOtQuantityWholeQuartersForOilGallon(rawQty, before.inventoryItem);
          newStoredQty = otPartQuantityToInventoryGallons(rawQty, before.inventoryItem);
          assertPartQuantityMatchesMeasurementUnit(newStoredQty, before.inventoryItem.measurementUnit.slug);
          const delta = newStoredQty.minus(before.quantity);
          if (!delta.eq(0)) {
            await tx.$executeRaw(
              Prisma.sql`SELECT id FROM "inventory_items" WHERE id = ${before.inventoryItemId} FOR UPDATE`,
            );
            const item = await tx.inventoryItem.findUniqueOrThrow({
              where: { id: before.inventoryItemId },
            });
            if (delta.gt(0) && item.quantityOnHand.lt(delta)) {
              throw new BadRequestException('Stock insuficiente para el incremento de cantidad');
            }
            await tx.inventoryItem.update({
              where: { id: item.id },
              data: { quantityOnHand: item.quantityOnHand.minus(delta) },
            });
            await tx.inventoryMovement.create({
              data: {
                inventoryItemId: item.id,
                quantityChange: delta.neg(),
                movementType: InventoryMovementType.WORK_ORDER_CONSUMPTION,
                referenceType: INVENTORY_REF_WORK_ORDER_LINE,
                referenceId: before.id,
                note: 'Ajuste por edición de cantidad en línea',
                createdById: actor.sub,
              },
            });
          }
        }
        quantityPatch = newStoredQty;
      }

      let unitPriceResolved: Prisma.Decimal | null | undefined = undefined;
      if (dto.unitPrice !== undefined) {
        if (dto.unitPrice === null) {
          unitPriceResolved = null;
        } else {
          let p = decimalFromMoneyApiString(dto.unitPrice);
          if (
            before.lineType === WorkOrderLineType.PART &&
            before.inventoryItem &&
            inventoryItemUsesQuarterGallonOtQuantity(before.inventoryItem)
          ) {
            p = oilOtQuarterUnitPriceToStoredGallonUnitPrice(p);
          }
          unitPriceResolved = p;
        }
      }

      return tx.workOrderLine.update({
        where: { id: lineId },
        data: {
          quantity: quantityPatch,
          unitPrice: unitPriceResolved,
          discountAmount:
            dto.discountAmount === undefined
              ? undefined
              : dto.discountAmount === null
                ? null
                : decimalFromMoneyApiString(dto.discountAmount),
          taxRateId: dto.taxRateId,
          taxRatePercentSnapshot: taxRatePercentSnapshotPatch,
          serviceId: dto.serviceId,
          description: dto.description !== undefined ? dto.description?.trim() ?? null : undefined,
        },
        include: lineInclude,
      });
    });

    await this.audit.recordDomain({
      actorUserId: actor.sub,
      action: 'work_order_lines.updated',
      entityType: 'WorkOrderLine',
      entityId: lineId,
      previousPayload: { workOrderId },
      nextPayload: { workOrderId, fields: keys },
      ipAddress: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    });

    return this.redactLineForActor(actor, updated);
  }

  async remove(workOrderId: string, lineId: string, actor: JwtUserPayload, meta: { ip?: string; userAgent?: string }) {
    await this.workOrders.assertWorkOrderVisible(actor, workOrderId);

    await this.prisma.$transaction(async (tx) => {
      await this.lockWorkOrder(tx, workOrderId);
      await this.assertWorkOrderEditable(tx, workOrderId);

      const line = await tx.workOrderLine.findFirst({
        where: { id: lineId, workOrderId },
      });
      if (!line) {
        throw new NotFoundException('Línea no encontrada en esta orden');
      }

      await this.assertWorkOrderPartLineManagersOnly(actor, line.lineType)

      if (line.lineType === WorkOrderLineType.PART && line.inventoryItemId) {
        await tx.$executeRaw(
          Prisma.sql`SELECT id FROM "inventory_items" WHERE id = ${line.inventoryItemId} FOR UPDATE`,
        );
        const item = await tx.inventoryItem.findUniqueOrThrow({ where: { id: line.inventoryItemId } });
        await tx.inventoryItem.update({
          where: { id: item.id },
          data: { quantityOnHand: item.quantityOnHand.plus(line.quantity) },
        });
        await tx.inventoryMovement.create({
          data: {
            inventoryItemId: item.id,
            quantityChange: line.quantity,
            movementType: InventoryMovementType.ADJUSTMENT_IN,
            referenceType: INVENTORY_REF_WORK_ORDER_LINE,
            referenceId: line.id,
            note: 'Reversión por eliminación de línea de OT',
            createdById: actor.sub,
          },
        });
      }

      await tx.workOrderLine.delete({ where: { id: lineId } });
    });

    await this.audit.recordDomain({
      actorUserId: actor.sub,
      action: 'work_order_lines.deleted',
      entityType: 'WorkOrderLine',
      entityId: lineId,
      previousPayload: { workOrderId },
      nextPayload: null,
      ipAddress: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    });
  }

  private async lockWorkOrder(tx: Prisma.TransactionClient, workOrderId: string): Promise<void> {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "work_orders" WHERE id = ${workOrderId} FOR UPDATE`);
  }

  private async assertWorkOrderEditable(tx: Prisma.TransactionClient, workOrderId: string): Promise<void> {
    const wo = await tx.workOrder.findUnique({
      where: { id: workOrderId },
      select: { status: true },
    });
    if (!wo) {
      throw new NotFoundException('Orden de trabajo no encontrada');
    }
    if (wo.status === WorkOrderStatus.DELIVERED || wo.status === WorkOrderStatus.CANCELLED) {
      throw new ConflictException('La orden está cerrada; no admite cambios en líneas');
    }
  }

  private async nextSortOrder(tx: Prisma.TransactionClient, workOrderId: string): Promise<number> {
    const agg = await tx.workOrderLine.aggregate({
      where: { workOrderId },
      _max: { sortOrder: true },
    });
    return (agg._max.sortOrder ?? -1) + 1;
  }
}
