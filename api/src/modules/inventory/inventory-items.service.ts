import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, WorkOrderLineType } from '@prisma/client';
import { ceilWholeCop, decimalFromMoneyApiString } from '../../common/money/cop-money';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { JwtUserPayload } from '../auth/types/jwt-user.payload';
import { actorMayViewWorkOrderFinancials } from '../work-orders/work-orders.visibility';
import type { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import type { UpdateInventoryItemDto } from './dto/update-inventory-item.dto';
import { inventoryItemIsOilDrum55Gallon } from './oil-drum-detect';
import { normalizeInventorySkuNumeracion } from './inventory.constants';

const unitBrief = { select: { id: true, slug: true, name: true } };

@Injectable()
export class InventoryItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Costo promedio: perfiles de compras/inventario e informes; no técnico con solo lectura de ítems. */
  private actorMayViewInventoryAverageCost(actor: JwtUserPayload): boolean {
    return (
      actor.permissions.includes('inventory_items:update') ||
      actor.permissions.includes('purchase_receipts:create') ||
      actor.permissions.includes('purchase_receipts:read') ||
      actor.permissions.includes('reports:read')
    );
  }

  private stripInventoryAverageCostIfNeeded<T extends { averageCost: unknown }>(
    actor: JwtUserPayload,
    row: T,
  ): T {
    if (this.actorMayViewInventoryAverageCost(actor)) {
      return row;
    }
    return { ...row, averageCost: null } as T;
  }

  async list(actor: JwtUserPayload) {
    const rows = await this.prisma.inventoryItem.findMany({
      where: { isActive: true },
      orderBy: { sku: 'asc' },
      take: 500,
      include: { measurementUnit: unitBrief },
    });
    return rows.map((r) => this.stripInventoryAverageCostIfNeeded(actor, r));
  }

  /**
   * Ítems desactivados (`isActive=false`): no aparecen en el catálogo normal pero siguen en BD.
   * Modo desarrollador en inventario para listarlos y poder borrarlos si aplican las reglas.
   */
  async listHiddenInventoryItems(actor: JwtUserPayload) {
    const rows = await this.prisma.inventoryItem.findMany({
      where: { isActive: false },
      orderBy: { sku: 'asc' },
      take: 5000,
      include: { measurementUnit: unitBrief },
    });
    return rows.map((r) => this.stripInventoryAverageCostIfNeeded(actor, r));
  }

  async findOne(id: string, actor: JwtUserPayload) {
    const row = await this.prisma.inventoryItem.findUnique({
      where: { id },
      include: { measurementUnit: unitBrief },
    });
    if (!row) {
      throw new NotFoundException('Ítem de inventario no encontrado');
    }
    return this.stripInventoryAverageCostIfNeeded(actor, row);
  }

  async create(
    actorUserId: string,
    dto: CreateInventoryItemDto,
    meta: { ip?: string; userAgent?: string },
  ) {
    const mu = await this.prisma.measurementUnit.findUnique({
      where: { slug: dto.measurementUnitSlug.trim().toLowerCase() },
    });
    if (!mu) {
      throw new NotFoundException('Unidad de medida no encontrada');
    }

    const initial = dto.initialQuantity ? new Prisma.Decimal(dto.initialQuantity) : new Prisma.Decimal(0);
    if (initial.lt(0)) {
      throw new BadRequestException('Cantidad inicial inválida');
    }

    const skuNorm = normalizeInventorySkuNumeracion(dto.sku.trim());

    const row = await this.prisma.inventoryItem.create({
      data: {
        sku: skuNorm,
        supplier: dto.supplier?.trim() ?? '',
        category: dto.category?.trim() ?? '',
        itemKind: dto.itemKind ?? undefined,
        name: dto.name.trim(),
        reference: dto.reference?.trim() ?? '',
        measurementUnitId: mu.id,
        quantityOnHand: initial,
        averageCost: dto.averageCost ? decimalFromMoneyApiString(dto.averageCost) : null,
        trackStock: dto.trackStock ?? true,
      },
      include: { measurementUnit: unitBrief },
    });

    await this.audit.recordDomain({
      actorUserId,
      action: 'inventory_items.created',
      entityType: 'InventoryItem',
      entityId: row.id,
      previousPayload: null,
      nextPayload: { sku: row.sku, name: row.name },
      ipAddress: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    });

    return row;
  }

  /**
   * Borra un ítem solo si no tiene uso en documentos (OT, ventas, compras, facturas, cotizaciones)
   * y el stock es cero. Elimina movimientos de inventario huérfanos del mismo ítem en la misma transacción.
   */
  async delete(
    id: string,
    actorUserId: string,
    meta: { ip?: string; userAgent?: string },
  ) {
    const item = await this.prisma.inventoryItem.findUnique({ where: { id } });
    if (!item) {
      throw new NotFoundException('Ítem de inventario no encontrado');
    }
    if (!item.quantityOnHand.equals(new Prisma.Decimal(0)) && item.isActive) {
      throw new BadRequestException(
        'Solo se pueden borrar ítems activos con stock en cero. Los ítems ocultos del catálogo (`isActive=false`) se pueden borrar aunque tengan stock.',
      );
    }

    const [wo, sale, pr, inv, quot] = await Promise.all([
      this.prisma.workOrderLine.count({ where: { inventoryItemId: id } }),
      this.prisma.saleLine.count({ where: { inventoryItemId: id } }),
      this.prisma.purchaseReceiptLine.count({ where: { inventoryItemId: id } }),
      this.prisma.invoiceLine.count({ where: { inventoryItemId: id } }),
      this.prisma.quoteLine.count({ where: { inventoryItemId: id } }),
    ]);
    const refs = wo + sale + pr + inv + quot;
    if (refs > 0) {
      throw new ConflictException(
        'Este ítem no se puede borrar: está referenciado en órdenes de trabajo, ventas, compras, facturas o cotizaciones. Quitá las líneas vinculadas antes.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.inventoryMovement.deleteMany({ where: { inventoryItemId: id } });
      await tx.inventoryItem.delete({ where: { id } });
    });

    await this.audit.recordDomain({
      actorUserId,
      action: 'inventory_items.deleted',
      entityType: 'InventoryItem',
      entityId: id,
      previousPayload: { sku: item.sku, name: item.name },
      nextPayload: null,
      ipAddress: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    });

    return { ok: true };
  }

  async update(
    id: string,
    actorUserId: string,
    dto: UpdateInventoryItemDto,
    meta: { ip?: string; userAgent?: string },
  ) {
    const keys = Object.keys(dto).filter((k) => dto[k as keyof UpdateInventoryItemDto] !== undefined);
    if (keys.length === 0) {
      throw new BadRequestException('No hay campos para actualizar');
    }

    const before = await this.prisma.inventoryItem.findUnique({ where: { id } });
    if (!before) {
      throw new NotFoundException('Ítem de inventario no encontrado');
    }

    const row = await this.prisma.inventoryItem.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        reference: dto.reference !== undefined ? dto.reference.trim() : undefined,
        supplier: dto.supplier !== undefined ? dto.supplier.trim() : undefined,
        category: dto.category !== undefined ? dto.category.trim() : undefined,
        itemKind: dto.itemKind,
        averageCost:
          dto.averageCost === undefined
            ? undefined
            : dto.averageCost === null
              ? null
              : decimalFromMoneyApiString(dto.averageCost),
        trackStock: dto.trackStock,
        isActive: dto.isActive,
      },
      include: { measurementUnit: unitBrief },
    });

    await this.audit.recordDomain({
      actorUserId,
      action: 'inventory_items.updated',
      entityType: 'InventoryItem',
      entityId: id,
      previousPayload: { name: before.name, isActive: before.isActive },
      nextPayload: { name: row.name, isActive: row.isActive, fields: keys },
      ipAddress: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    });

    return row;
  }

  /**
   * Resumen económico para la pantalla Aceite (caneca): última compra, stock a costo medio,
   * facturación aprox. en OT (margen vs costo medio actual — no es costo histórico por lote).
   */
  async oilDrumEconomics(actor: JwtUserPayload) {
    const mayCost = this.actorMayViewInventoryAverageCost(actor);
    const mayWoMoney = actorMayViewWorkOrderFinancials(actor);

    const rows = await this.prisma.inventoryItem.findMany({
      where: { isActive: true },
      orderBy: { sku: 'asc' },
      take: 500,
      include: { measurementUnit: unitBrief },
    });

    const drumRows = rows.filter((r) => inventoryItemIsOilDrum55Gallon(r));
    const drumIds = drumRows.map((r) => r.id);
    if (drumIds.length === 0) {
      return {
        flags: { includesPurchaseSnapshot: mayCost, includesStockAtCost: mayCost, includesOtApproxMargin: mayCost && mayWoMoney },
        items: [] as OilDrumEconomicsItemDto[],
      };
    }

    const prLines =
      mayCost ?
        await this.prisma.purchaseReceiptLine.findMany({
          where: { inventoryItemId: { in: drumIds } },
          include: {
            purchaseReceipt: { select: { createdAt: true, paymentSource: true } },
          },
          orderBy: { purchaseReceipt: { createdAt: 'desc' } },
        })
      : [];

    const lastPurchaseByItem = new Map<string, (typeof prLines)[0]>();
    for (const line of prLines) {
      if (!lastPurchaseByItem.has(line.inventoryItemId)) {
        lastPurchaseByItem.set(line.inventoryItemId, line);
      }
    }

    const woLines =
      mayCost && mayWoMoney ?
        await this.prisma.workOrderLine.findMany({
          where: {
            lineType: WorkOrderLineType.PART,
            inventoryItemId: { in: drumIds },
            unitPrice: { not: null },
          },
          select: { inventoryItemId: true, quantity: true, unitPrice: true },
        })
      : [];

    const woAgg = new Map<
      string,
      { revenue: Prisma.Decimal; qtySold: Prisma.Decimal }
    >();
    for (const ln of woLines) {
      if (!ln.inventoryItemId || !ln.unitPrice) continue;
      const prev = woAgg.get(ln.inventoryItemId) ?? {
        revenue: new Prisma.Decimal(0),
        qtySold: new Prisma.Decimal(0),
      };
      const lineRev = ln.quantity.mul(ln.unitPrice);
      woAgg.set(ln.inventoryItemId, {
        revenue: prev.revenue.add(lineRev),
        qtySold: prev.qtySold.add(ln.quantity),
      });
    }

    const items: OilDrumEconomicsItemDto[] = drumRows.map((r) => {
      const base = {
        inventoryItemId: r.id,
        sku: r.sku,
        name: r.name,
        category: r.category,
        measurementUnit: r.measurementUnit,
        quantityOnHand: r.quantityOnHand.toString(),
      };

      if (!mayCost) {
        return {
          ...base,
          averageCost: null,
          stockAtAverageCostCop: null,
          lastPurchase: null,
          workOrderPart: null,
        };
      }

      const avg = r.averageCost;
      const qtyOnHand = r.quantityOnHand;
      const stockAtAvgCop =
        avg && qtyOnHand.gt(0) ? ceilWholeCop(qtyOnHand.mul(avg)).toString() : null;

      const pr = lastPurchaseByItem.get(r.id);
      let lastPurchase: OilDrumEconomicsItemDto['lastPurchase'] = null;
      if (pr) {
        const totalFromLine =
          pr.lineTotalCost && pr.quantity.gt(0) ? pr.lineTotalCost : null;
        const totalFromUnit =
          !totalFromLine && pr.unitCost && pr.quantity.gt(0) ?
            ceilWholeCop(pr.unitCost.mul(pr.quantity))
          : null;
        const totalPaidCop =
          totalFromLine?.toString() ?? totalFromUnit?.toString() ?? null;
        lastPurchase = {
          receivedAt: pr.purchaseReceipt.createdAt.toISOString(),
          paymentSource: pr.purchaseReceipt.paymentSource,
          quantity: pr.quantity.toString(),
          lineTotalCost: pr.lineTotalCost?.toString() ?? null,
          unitCost: pr.unitCost?.toString() ?? null,
          totalPaidCop,
        };
      }

      let workOrderPart: OilDrumEconomicsItemDto['workOrderPart'] = null;
      if (mayWoMoney) {
        const agg = woAgg.get(r.id);
        if (agg && (agg.revenue.gt(0) || agg.qtySold.gt(0))) {
          const revenueCop = ceilWholeCop(agg.revenue);
          const hasAvg = Boolean(avg && agg.qtySold.gt(0));
          const approxCogs = hasAvg && avg ? ceilWholeCop(agg.qtySold.mul(avg)) : null;
          const approximateMarginCop =
            approxCogs !== null ? revenueCop.minus(approxCogs) : null;
          workOrderPart = {
            quantitySold: agg.qtySold.toString(),
            revenueCop: revenueCop.toString(),
            approximateCostAtAverageCop: approxCogs?.toString() ?? null,
            approximateMarginCop: approximateMarginCop?.toString() ?? null,
          };
        }
      }

      return {
        ...base,
        averageCost: avg?.toString() ?? null,
        stockAtAverageCostCop: stockAtAvgCop,
        lastPurchase,
        workOrderPart,
      };
    });

    return {
      flags: {
        includesPurchaseSnapshot: mayCost,
        includesStockAtCost: mayCost,
        includesOtApproxMargin: mayCost && mayWoMoney,
      },
      items,
    };
  }
}

type OilDrumEconomicsItemDto = {
  inventoryItemId: string;
  sku: string;
  name: string;
  category: string;
  measurementUnit: { id: string; slug: string; name: string };
  quantityOnHand: string;
  averageCost?: string | null;
  stockAtAverageCostCop?: string | null;
  lastPurchase: {
    receivedAt: string;
    paymentSource: string;
    quantity: string;
    lineTotalCost: string | null;
    unitCost: string | null;
    totalPaidCop: string | null;
  } | null;
  workOrderPart: {
    quantitySold: string;
    revenueCop: string;
    approximateCostAtAverageCop: string | null;
    approximateMarginCop: string | null;
  } | null;
}
