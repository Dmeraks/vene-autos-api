/**
 * Sale lines service: editores sobre una venta **en borrador**.
 *
 * A diferencia de OT:
 *  - Agregar una línea PART NO descuenta inventario; el stock se mueve al confirmar
 *    la venta (una sola transacción grande, menos sorpresas si el cajero abandona
 *    la venta a medias).
 *  - Por la misma razón, editar/eliminar líneas en DRAFT no genera movimientos.
 *  - Si la venta nace de una OT (origen WORK_ORDER), las líneas no son editables:
 *    para cambiar algo hay que reabrir la OT o emitir nota crédito (fases posteriores).
 */
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  SaleLineType,
  SaleOrigin,
  SaleStatus,
} from '@prisma/client';
import { decimalFromMoneyApiString } from '../../common/money/cop-money';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { JwtUserPayload } from '../auth/types/jwt-user.payload';
import {
  actorMayViewSaleFinancials,
} from './sales.visibility';
import type { CreateSaleLineDto } from './dto/create-sale-line.dto';
import type { UpdateSaleLineDto } from './dto/update-sale-line.dto';
import { SalesService } from './sales.service';

const lineInclude = {
  inventoryItem: {
    select: {
      id: true,
      sku: true,
      name: true,
      itemKind: true,
      averageCost: true,
      trackStock: true,
      isActive: true,
      measurementUnit: { select: { id: true, slug: true, name: true } },
    },
  },
  service: { select: { id: true, code: true, name: true } },
  taxRate: { select: { id: true, slug: true, name: true, kind: true, ratePercent: true } },
} as const;

@Injectable()
export class SaleLinesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sales: SalesService,
  ) {}

  async list(saleId: string, actor: JwtUserPayload) {
    await this.sales.assertSaleVisible(actor, saleId);
    return this.prisma.saleLine.findMany({
      where: { saleId },
      orderBy: { sortOrder: 'asc' },
      include: lineInclude,
    });
  }

  async create(
    saleId: string,
    actor: JwtUserPayload,
    dto: CreateSaleLineDto,
    meta: { ip?: string; userAgent?: string },
  ) {
    await this.sales.assertSaleVisible(actor, saleId);

    if (dto.lineType === SaleLineType.PART) {
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

    // Resolver servicio / tarifa por fuera de la tx para respuestas rápidas ante errores de validación.
    let resolvedServiceDescription: string | null = null;
    let resolvedServiceUnitPrice: Prisma.Decimal | null = null;
    let resolvedServiceTaxRateId: string | null = null;
    if (dto.serviceId) {
      const svc = await this.prisma.service.findUnique({ where: { id: dto.serviceId } });
      if (!svc) throw new NotFoundException('Servicio no encontrado');
      if (!svc.isActive) throw new BadRequestException('El servicio seleccionado está desactivado');
      resolvedServiceDescription = svc.name;
      resolvedServiceUnitPrice = svc.defaultUnitPrice ?? null;
      resolvedServiceTaxRateId = svc.defaultTaxRateId ?? null;
    }

    const effectiveTaxRateId = dto.taxRateId ?? resolvedServiceTaxRateId ?? null;
    let taxRatePercentSnapshotForSave: Prisma.Decimal | null = null;
    if (effectiveTaxRateId) {
      const tax = await this.prisma.taxRate.findUnique({ where: { id: effectiveTaxRateId } });
      if (!tax) throw new NotFoundException('Tarifa de impuesto no encontrada');
      if (!tax.isActive) throw new BadRequestException('La tarifa de impuesto seleccionada está desactivada');
      taxRatePercentSnapshotForSave = tax.ratePercent;
    }

    const mayFinancials = actorMayViewSaleFinancials(actor);
    const unitPriceForSave =
      mayFinancials && dto.unitPrice?.trim()
        ? decimalFromMoneyApiString(dto.unitPrice)
        : mayFinancials && resolvedServiceUnitPrice
          ? resolvedServiceUnitPrice
          : null;

    const discountForSave =
      mayFinancials && dto.discountAmount?.trim()
        ? decimalFromMoneyApiString(dto.discountAmount)
        : null;

    const taxRateIdForSave = dto.taxRateId ?? resolvedServiceTaxRateId ?? null;

    const line = await this.prisma.$transaction(async (tx) => {
      await this.assertSaleDraftAndEditable(tx, saleId);

      const sortOrder = await this.nextSortOrder(tx, saleId);

      if (dto.lineType === SaleLineType.LABOR) {
        const descriptionForSave = dto.description?.trim() || resolvedServiceDescription || '';
        return tx.saleLine.create({
          data: {
            saleId,
            lineType: SaleLineType.LABOR,
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

      // PART line (sin consumo todavía; solo validamos existencia/activación para fallar temprano).
      const item = await tx.inventoryItem.findUnique({
        where: { id: dto.inventoryItemId! },
      });
      if (!item || !item.isActive) {
        throw new NotFoundException('Ítem de inventario no encontrado');
      }
      if (!item.trackStock) {
        throw new BadRequestException('Este ítem no lleva stock y no puede venderse por línea PART');
      }

      return tx.saleLine.create({
        data: {
          saleId,
          lineType: SaleLineType.PART,
          sortOrder,
          inventoryItemId: item.id,
          taxRateId: taxRateIdForSave,
          taxRatePercentSnapshot: taxRatePercentSnapshotForSave,
          description: dto.description?.trim() ?? null,
          quantity: qty,
          unitPrice: unitPriceForSave,
          discountAmount: discountForSave,
          costSnapshot: item.averageCost ?? null,
        },
        include: lineInclude,
      });
    });

    await this.audit.recordDomain({
      actorUserId: actor.sub,
      action: 'sale_lines.created',
      entityType: 'SaleLine',
      entityId: line.id,
      previousPayload: null,
      nextPayload: { saleId, lineType: line.lineType, quantity: dto.quantity },
      ipAddress: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    });

    return line;
  }

  async update(
    saleId: string,
    lineId: string,
    actor: JwtUserPayload,
    dto: UpdateSaleLineDto,
    meta: { ip?: string; userAgent?: string },
  ) {
    await this.sales.assertSaleVisible(actor, saleId);
    const keys = Object.keys(dto).filter((k) => dto[k as keyof UpdateSaleLineDto] !== undefined);
    if (keys.length === 0) {
      throw new BadRequestException('No hay campos para actualizar');
    }

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
      if (!svc.isActive) throw new BadRequestException('El servicio seleccionado está desactivado');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await this.assertSaleDraftAndEditable(tx, saleId);

      const before = await tx.saleLine.findFirst({ where: { id: lineId, saleId } });
      if (!before) throw new NotFoundException('Línea no encontrada en esta venta');

      let quantityPatch: Prisma.Decimal | undefined;
      if (dto.quantity !== undefined) {
        const q = new Prisma.Decimal(dto.quantity);
        if (q.lte(0)) throw new BadRequestException('La cantidad debe ser mayor a cero');
        quantityPatch = q;
      }

      return tx.saleLine.update({
        where: { id: lineId },
        data: {
          quantity: quantityPatch,
          unitPrice:
            dto.unitPrice === undefined
              ? undefined
              : dto.unitPrice === null
                ? null
                : decimalFromMoneyApiString(dto.unitPrice),
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
      action: 'sale_lines.updated',
      entityType: 'SaleLine',
      entityId: lineId,
      previousPayload: { saleId },
      nextPayload: { saleId, fields: keys },
      ipAddress: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    });

    return updated;
  }

  async remove(
    saleId: string,
    lineId: string,
    actor: JwtUserPayload,
    meta: { ip?: string; userAgent?: string },
  ) {
    await this.sales.assertSaleVisible(actor, saleId);

    await this.prisma.$transaction(async (tx) => {
      await this.assertSaleDraftAndEditable(tx, saleId);
      const line = await tx.saleLine.findFirst({ where: { id: lineId, saleId } });
      if (!line) throw new NotFoundException('Línea no encontrada en esta venta');
      await tx.saleLine.delete({ where: { id: lineId } });
    });

    await this.audit.recordDomain({
      actorUserId: actor.sub,
      action: 'sale_lines.deleted',
      entityType: 'SaleLine',
      entityId: lineId,
      previousPayload: { saleId },
      nextPayload: null,
      ipAddress: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async assertSaleDraftAndEditable(tx: Prisma.TransactionClient, saleId: string): Promise<void> {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "sales" WHERE id = ${saleId} FOR UPDATE`);
    const sale = await tx.sale.findUnique({ where: { id: saleId }, select: { status: true, origin: true } });
    if (!sale) throw new NotFoundException('Venta no encontrada');
    if (sale.status !== SaleStatus.DRAFT) {
      throw new ConflictException('Solo se pueden editar líneas de una venta en borrador');
    }
    if (sale.origin === SaleOrigin.WORK_ORDER) {
      throw new ConflictException(
        'Las ventas derivadas de una OT no permiten editar líneas. Para corregir, emitir nota crédito (próxima fase).',
      );
    }
  }

  private async nextSortOrder(tx: Prisma.TransactionClient, saleId: string): Promise<number> {
    const agg = await tx.saleLine.aggregate({ where: { saleId }, _max: { sortOrder: true } });
    return (agg._max.sortOrder ?? -1) + 1;
  }
}
