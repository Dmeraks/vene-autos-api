/**
 * Cotizaciones (presupuesto sin consumo de inventario).
 */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import {
  Prisma,
  QuoteLineType,
  QuoteStatus,
  WorkOrderLineType,
} from '@prisma/client';
import {
  computeBillingTotals,
  computeLineTotals,
  serializeBillingTotals,
  serializeLineTotals,
  type LineForTotals,
} from '../../common/billing/billing-totals';
import { decimalFromMoneyApiString } from '../../common/money/cop-money';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { JwtUserPayload } from '../auth/types/jwt-user.payload';
import {
  allowsFractionalWorkOrderPartQuantity,
  QTY_DECIMAL_REGEX,
} from '../inventory/inventory.constants';
import { InventoryAdhocSkuService } from '../inventory/inventory-adhoc-sku.service';
import type { CreateQuoteDto } from './dto/create-quote.dto';
import type { CreateQuoteLineDto } from './dto/create-quote-line.dto';
import type { ListQuotesQueryDto } from './dto/list-quotes.query.dto';
import type { UpdateQuoteDto } from './dto/update-quote.dto';
import type { UpdateQuoteLineDto } from './dto/update-quote-line.dto';
import { formatQuotePublicCode } from './quote-public-code';
import { quotesJsonSafe } from './quotes-json.helper';
import { normalizeVehiclePlate } from '../vehicles/vehicle-plate.util';

export const QUOTES_READ_ALL = 'quotes:read_all' as const;

const LIST_PAGE_SIZE_DEFAULT = 50;
const LIST_PAGE_SIZE_MAX = 100;

const userBrief = { select: { id: true, email: true, fullName: true, isActive: true } };

const vehicleWithCustomer = {
  include: {
    customer: { select: { id: true, displayName: true, primaryPhone: true, documentId: true, email: true } },
  },
};

const quoteLineInclude = {
  inventoryItem: {
    include: { measurementUnit: { select: { id: true, slug: true, name: true } } },
  },
  taxRate: { select: { id: true, slug: true, name: true, kind: true, ratePercent: true } },
  service: { select: { id: true, code: true, name: true } },
} as const;

function actorMayViewQuoteFinancials(actor: JwtUserPayload): boolean {
  return actor.permissions.includes('quotes:view_financials');
}

function quoteLineTypeToWorkOrderLineType(t: QuoteLineType): WorkOrderLineType {
  return t === QuoteLineType.LABOR ? WorkOrderLineType.LABOR : WorkOrderLineType.PART;
}

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

function parseValidUntil(raw: string | undefined | null): Date | null {
  if (raw == null || String(raw).trim() === '') {
    return null;
  }
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    throw new BadRequestException('Fecha de validez inválida');
  }
  return d;
}

function assertQuoteStatusEditable(status: QuoteStatus): void {
  if (status !== QuoteStatus.DRAFT) {
    throw new BadRequestException('Las líneas solo se pueden editar en borrador.');
  }
}

/** Conserva texto no vacío (trim); sirve para snapshot al pasar a enviada / PDF. */
function pickNonEmpty(...vals: (string | null | undefined)[]): string | null {
  for (const val of vals) {
    const t = val?.trim();
    if (t) return t;
  }
  return null;
}

/** Regla operativa: enviada solo con datos mínimos congelados para PDF (nombre, tel, marca, modelo). */
function assertContactRequiredForSend(frozen: {
  customerName: string | null | undefined;
  customerPhone: string | null | undefined;
  vehicleBrand: string | null | undefined;
  vehicleModel: string | null | undefined;
}): void {
  const missing: string[] = [];
  if (!pickNonEmpty(frozen.customerName)) missing.push('nombre del cliente');
  if (!pickNonEmpty(frozen.customerPhone)) missing.push('teléfono');
  if (!pickNonEmpty(frozen.vehicleBrand)) missing.push('marca del vehículo');
  if (!pickNonEmpty(frozen.vehicleModel)) missing.push('modelo del vehículo');
  if (missing.length > 0) {
    throw new BadRequestException(
      `No se puede marcar como enviada sin: ${missing.join(', ')}.`,
    );
  }
}

function assertQuoteStatusTransition(from: QuoteStatus, to: QuoteStatus): void {
  if (from === to) return;
  if (
    from === QuoteStatus.ACCEPTED ||
    from === QuoteStatus.CANCELLED ||
    from === QuoteStatus.REJECTED
  ) {
    throw new BadRequestException('Esta cotización ya está cerrada.');
  }
  const allowed: Record<QuoteStatus, QuoteStatus[]> = {
    [QuoteStatus.DRAFT]: [QuoteStatus.SENT, QuoteStatus.CANCELLED],
    [QuoteStatus.SENT]: [QuoteStatus.ACCEPTED, QuoteStatus.CANCELLED],
    [QuoteStatus.ACCEPTED]: [],
    [QuoteStatus.REJECTED]: [],
    [QuoteStatus.CANCELLED]: [],
  };
  if (!allowed[from]?.includes(to)) {
    throw new BadRequestException(`Transición de estado no permitida (${from} → ${to}).`);
  }
}

@Injectable()
export class QuotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly adHocSku: InventoryAdhocSkuService,
  ) {}

  quoteVisibilityWhere(actor: JwtUserPayload): Prisma.QuoteWhereInput {
    const perms = actor.permissions ?? [];
    if (perms.includes(QUOTES_READ_ALL)) {
      return {};
    }
    /** Listado acotado al creador si no hay `read_all` (incluye quien solo tiene líneas u operación). */
    const maySeeOwn =
      perms.includes('quotes:read') ||
      perms.includes('quotes:create') ||
      perms.includes('quotes:update') ||
      perms.includes('quotes:view_financials') ||
      perms.includes('quote_lines:create') ||
      perms.includes('quote_lines:update') ||
      perms.includes('quote_lines:delete');
    if (maySeeOwn) {
      return { createdById: actor.sub };
    }
    return { id: { in: [] } };
  }

  async assertQuoteVisible(actor: JwtUserPayload, quoteId: string): Promise<void> {
    const row = await this.prisma.quote.findFirst({
      where: { id: quoteId, ...this.quoteVisibilityWhere(actor) },
      select: { id: true },
    });
    if (!row) {
      throw new NotFoundException('Cotización no encontrada');
    }
  }

  /**
   * Congelación de cliente/vehículo al pasar a enviada: combina snapshot en cabecera con datos del maestro.
   */
  private mergeFrozenContactFromQuoteRow(
    row: Prisma.QuoteGetPayload<{ include: { vehicle: typeof vehicleWithCustomer } }>,
  ): Pick<
    Prisma.QuoteUpdateInput,
    'customerName' | 'customerPhone' | 'customerEmail' | 'vehiclePlate' | 'vehicleBrand' | 'vehicleModel'
  > {
    const v = row.vehicle;
    const c = v?.customer;
    return {
      customerName: pickNonEmpty(row.customerName, c?.displayName) ?? null,
      customerPhone: pickNonEmpty(row.customerPhone, c?.primaryPhone) ?? null,
      customerEmail: pickNonEmpty(row.customerEmail, c?.email) ?? null,
      vehiclePlate: pickNonEmpty(row.vehiclePlate, v?.plate) ?? null,
      vehicleBrand: pickNonEmpty(row.vehicleBrand, v?.brand) ?? null,
      vehicleModel: pickNonEmpty(row.vehicleModel, v?.model) ?? null,
    };
  }

  /** Campos editables en borrador (sin `status`). */
  private async buildDraftPatchFromDto(dto: UpdateQuoteDto): Promise<Prisma.QuoteUpdateInput> {
    const data: Prisma.QuoteUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title.trim();
    if (dto.description !== undefined) data.description = dto.description?.trim() ?? null;
    if (dto.internalNotes !== undefined) data.internalNotes = dto.internalNotes?.trim() ?? null;
    if (dto.validUntil !== undefined) data.validUntil = parseValidUntil(dto.validUntil);
    if (dto.customerName !== undefined) data.customerName = dto.customerName?.trim() ?? null;
    if (dto.customerPhone !== undefined) data.customerPhone = dto.customerPhone?.trim() ?? null;
    if (dto.customerEmail !== undefined) data.customerEmail = dto.customerEmail?.trim() || null;
    if (dto.vehiclePlate !== undefined) data.vehiclePlate = dto.vehiclePlate?.trim() ?? null;
    if (dto.vehicleBrand !== undefined) data.vehicleBrand = dto.vehicleBrand?.trim() ?? null;
    if (dto.vehicleModel !== undefined) data.vehicleModel = dto.vehicleModel?.trim() ?? null;

    if (dto.vehicleId !== undefined) {
      if (dto.vehicleId === null) {
        data.vehicle = { disconnect: true };
      } else {
        const v = await this.prisma.vehicle.findUnique({
          where: { id: dto.vehicleId },
          include: { customer: true },
        });
        if (!v || !v.isActive) {
          throw new NotFoundException('Vehículo no encontrado o inactivo');
        }
        data.vehicle = { connect: { id: v.id } };
        if (dto.customerName === undefined) data.customerName = v.customer.displayName;
        if (dto.customerPhone === undefined) data.customerPhone = v.customer.primaryPhone ?? null;
        if (dto.customerEmail === undefined) data.customerEmail = v.customer.email?.trim() ?? null;
        if (dto.vehiclePlate === undefined) data.vehiclePlate = v.plate;
        if (dto.vehicleBrand === undefined) data.vehicleBrand = v.brand?.trim() ?? null;
        if (dto.vehicleModel === undefined) data.vehicleModel = v.model?.trim() ?? null;
      }
    }

    return data;
  }

  private shapeQuoteLinesForActor(
    lines: Prisma.QuoteLineGetPayload<{ include: typeof quoteLineInclude }>[],
    actor: JwtUserPayload,
  ) {
    const mayFin = actorMayViewQuoteFinancials(actor);
    const linesForTotals: LineForTotals[] = lines.map((ln) => ({
      id: ln.id,
      lineType: quoteLineTypeToWorkOrderLineType(ln.lineType),
      quantity: ln.quantity,
      unitPrice: ln.unitPrice,
      discountAmount: ln.discountAmount,
      costSnapshot: null,
      taxRateId: ln.taxRateId,
      taxRatePercentSnapshot: ln.taxRatePercentSnapshot,
      taxRate: ln.taxRate ? { kind: ln.taxRate.kind } : null,
    }));

    const totals = computeBillingTotals(linesForTotals);
    return lines.map((ln, idx) => {
      const base = {
        ...ln,
        totals: serializeLineTotals(computeLineTotals(linesForTotals[idx])),
      };
      if (mayFin) return base;
      return {
        ...base,
        unitPrice: null,
        discountAmount: null,
        totals: null,
        inventoryItem: base.inventoryItem
          ? { ...base.inventoryItem, averageCost: null }
          : null,
      };
    });
  }

  private async shapeQuoteDetail(
    row: Prisma.QuoteGetPayload<{
      include: {
        createdBy: typeof userBrief;
        vehicle: typeof vehicleWithCustomer;
        lines: { orderBy: { sortOrder: 'asc' }; include: typeof quoteLineInclude };
      };
    }>,
    actor: JwtUserPayload,
  ) {
    const lines = row.lines ?? [];
    const shapedLines = this.shapeQuoteLinesForActor(lines, actor);
    const linesForTotals: LineForTotals[] = lines.map((ln) => ({
      id: ln.id,
      lineType: quoteLineTypeToWorkOrderLineType(ln.lineType),
      quantity: ln.quantity,
      unitPrice: ln.unitPrice,
      discountAmount: ln.discountAmount,
      costSnapshot: null,
      taxRateId: ln.taxRateId,
      taxRatePercentSnapshot: ln.taxRatePercentSnapshot,
      taxRate: ln.taxRate ? { kind: ln.taxRate.kind } : null,
    }));
    const totals = computeBillingTotals(linesForTotals);
    const serializedTotals = serializeBillingTotals(totals);
    const mayFin = actorMayViewQuoteFinancials(actor);
    return quotesJsonSafe({
      ...row,
      lines: shapedLines,
      totals: mayFin ? serializedTotals : null,
    });
  }

  async create(
    actor: JwtUserPayload,
    dto: CreateQuoteDto,
    meta: { ip?: string; userAgent?: string },
  ) {
    const actorUserId = actor.sub;
    let vehicleId = dto.vehicleId?.trim();

    const data: Omit<Prisma.QuoteCreateInput, 'publicCode'> = {
      title: dto.title.trim(),
      description: dto.description?.trim() ?? null,
      validUntil: parseValidUntil(dto.validUntil ?? null),
      customerName: dto.customerName?.trim() ?? null,
      customerPhone: dto.customerPhone?.trim() ?? null,
      customerEmail: dto.customerEmail?.trim() || null,
      vehiclePlate: dto.vehiclePlate?.trim() ?? null,
      vehicleBrand: dto.vehicleBrand?.trim() ?? null,
      vehicleModel: dto.vehicleModel?.trim() ?? null,
      internalNotes: dto.internalNotes?.trim() ?? null,
      status: QuoteStatus.DRAFT,
      createdBy: { connect: { id: actorUserId } },
    };

    if (vehicleId) {
      const v = await this.prisma.vehicle.findUnique({
        where: { id: vehicleId },
        include: { customer: true },
      });
      if (!v || !v.isActive) {
        throw new NotFoundException('Vehículo no encontrado o inactivo');
      }
      data.vehicle = { connect: { id: v.id } };
      data.customerName = dto.customerName?.trim() ?? v.customer.displayName;
      data.customerPhone = dto.customerPhone?.trim() ?? v.customer.primaryPhone ?? null;
      data.customerEmail =
        dto.customerEmail !== undefined ? dto.customerEmail?.trim() || null : v.customer.email?.trim() ?? null;
      data.vehiclePlate = dto.vehiclePlate?.trim() ?? v.plate;
      data.vehicleBrand = dto.vehicleBrand?.trim() ?? v.brand?.trim() ?? null;
      data.vehicleModel = dto.vehicleModel?.trim() ?? v.model?.trim() ?? null;
    }

    const pendingPublicCode = `T${randomBytes(10).toString('hex')}`;

    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.quote.create({
        data: { ...data, publicCode: pendingPublicCode },
        include: {
          createdBy: userBrief,
          vehicle: vehicleWithCustomer,
          lines: { orderBy: { sortOrder: 'asc' }, include: quoteLineInclude },
        },
      });
      const publicCode = formatQuotePublicCode(created.quoteNumber);
      return tx.quote.update({
        where: { id: created.id },
        data: { publicCode },
        include: {
          createdBy: userBrief,
          vehicle: vehicleWithCustomer,
          lines: { orderBy: { sortOrder: 'asc' }, include: quoteLineInclude },
        },
      });
    });

    await this.audit.recordDomain({
      actorUserId,
      action: 'quotes.created',
      entityType: 'Quote',
      entityId: row.id,
      previousPayload: null,
      nextPayload: {
        quoteNumber: row.quoteNumber,
        publicCode: row.publicCode,
        title: row.title,
        vehicleId: row.vehicleId,
      },
      ipAddress: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    });

    return this.shapeQuoteDetail(row, actor);
  }

  async list(actor: JwtUserPayload, query: ListQuotesQueryDto) {
    const visibility = this.quoteVisibilityWhere(actor);
    const clauses: Prisma.QuoteWhereInput[] = [];
    if (Object.keys(visibility).length > 0) {
      clauses.push(visibility);
    }
    if (query.status) {
      clauses.push({ status: query.status });
    }
    if (query.vehicleId) {
      clauses.push({ vehicleId: query.vehicleId });
    }
    if (query.customerId) {
      clauses.push({ vehicle: { is: { customerId: query.customerId } } });
    }
    const term = query.search?.trim();
    if (term) {
      clauses.push({
        OR: [
          { publicCode: { contains: term, mode: 'insensitive' } },
          { title: { contains: term, mode: 'insensitive' } },
          { description: { contains: term, mode: 'insensitive' } },
          { customerName: { contains: term, mode: 'insensitive' } },
          { vehiclePlate: { contains: term, mode: 'insensitive' } },
        ],
      });
    }
    const where: Prisma.QuoteWhereInput =
      clauses.length === 0 ? {} : clauses.length === 1 ? clauses[0]! : { AND: clauses };

    const page = query.page && query.page > 0 ? query.page : 1;
    const rawSize = query.pageSize && query.pageSize > 0 ? query.pageSize : LIST_PAGE_SIZE_DEFAULT;
    const pageSize = Math.min(LIST_PAGE_SIZE_MAX, rawSize);
    const skip = (page - 1) * pageSize;

    const [items, total] = await Promise.all([
      this.prisma.quote.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          createdBy: userBrief,
          vehicle: vehicleWithCustomer,
        },
      }),
      this.prisma.quote.count({ where }),
    ]);

    return quotesJsonSafe({ total, items });
  }

  async findOne(id: string, actor: JwtUserPayload) {
    const row = await this.prisma.quote.findFirst({
      where: { id, ...this.quoteVisibilityWhere(actor) },
      include: {
        createdBy: userBrief,
        vehicle: vehicleWithCustomer,
        lines: { orderBy: { sortOrder: 'asc' }, include: quoteLineInclude },
      },
    });
    if (!row) {
      throw new NotFoundException('Cotización no encontrada');
    }
    return this.shapeQuoteDetail(row, actor);
  }

  async update(
    id: string,
    actor: JwtUserPayload,
    dto: UpdateQuoteDto,
    meta: { ip?: string; userAgent?: string },
  ) {
    await this.assertQuoteVisible(actor, id);
    const prev = await this.prisma.quote.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        quoteNumber: true,
        title: true,
      },
    });
    if (!prev) throw new NotFoundException('Cotización no encontrada');

    const keys = Object.keys(dto).filter((k) => dto[k as keyof UpdateQuoteDto] !== undefined);
    if (keys.length === 0) {
      throw new BadRequestException('No hay campos para actualizar');
    }

    if (
      prev.status === QuoteStatus.ACCEPTED ||
      prev.status === QuoteStatus.CANCELLED ||
      prev.status === QuoteStatus.REJECTED
    ) {
      throw new BadRequestException('Esta cotización no admite modificaciones.');
    }

    if (prev.status === QuoteStatus.SENT) {
      const statusOnly =
        keys.length === 1 &&
        keys[0] === 'status' &&
        dto.status !== undefined &&
        (dto.status === QuoteStatus.ACCEPTED || dto.status === QuoteStatus.CANCELLED);
      if (!statusOnly) {
        throw new BadRequestException(
          'La cotización enviada está congelada: solo podés marcarla como aceptada o anularla.',
        );
      }
    }

    if (dto.status !== undefined && dto.status !== prev.status) {
      assertQuoteStatusTransition(prev.status, dto.status);
    }

    const becomingSent = prev.status === QuoteStatus.DRAFT && dto.status === QuoteStatus.SENT;

    if (becomingSent) {
      const draftPatch = await this.buildDraftPatchFromDto(dto);
      const row = await this.prisma.$transaction(async (tx) => {
        if (Object.keys(draftPatch).length > 0) {
          await tx.quote.update({ where: { id }, data: draftPatch });
        }
        const merged = await tx.quote.findUnique({
          where: { id },
          include: { vehicle: vehicleWithCustomer },
        });
        if (!merged) throw new NotFoundException('Cotización no encontrada');
        const snap = this.mergeFrozenContactFromQuoteRow(merged);
        assertContactRequiredForSend({
          customerName: snap.customerName as string | null | undefined,
          customerPhone: snap.customerPhone as string | null | undefined,
          vehicleBrand: snap.vehicleBrand as string | null | undefined,
          vehicleModel: snap.vehicleModel as string | null | undefined,
        });
        return tx.quote.update({
          where: { id },
          data: {
            ...snap,
            status: QuoteStatus.SENT,
          },
          include: {
            createdBy: userBrief,
            vehicle: vehicleWithCustomer,
            lines: { orderBy: { sortOrder: 'asc' }, include: quoteLineInclude },
          },
        });
      });

      await this.audit.recordDomain({
        actorUserId: actor.sub,
        action: 'quotes.updated',
        entityType: 'Quote',
        entityId: id,
        previousPayload: { status: prev.status, title: prev.title },
        nextPayload: dto,
        ipAddress: meta.ip ?? null,
        userAgent: meta.userAgent ?? null,
      });

      return this.shapeQuoteDetail(row, actor);
    }

    const data: Prisma.QuoteUpdateInput = await this.buildDraftPatchFromDto(dto);

    if (dto.status !== undefined) {
      data.status = dto.status;
    }

    const row = await this.prisma.quote.update({
      where: { id },
      data,
      include: {
        createdBy: userBrief,
        vehicle: vehicleWithCustomer,
        lines: { orderBy: { sortOrder: 'asc' }, include: quoteLineInclude },
      },
    });

    await this.audit.recordDomain({
      actorUserId: actor.sub,
      action: 'quotes.updated',
      entityType: 'Quote',
      entityId: id,
      previousPayload: { status: prev.status, title: prev.title },
      nextPayload: dto,
      ipAddress: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    });

    return this.shapeQuoteDetail(row, actor);
  }

  async createLine(
    quoteId: string,
    actor: JwtUserPayload,
    dto: CreateQuoteLineDto,
    meta: { ip?: string; userAgent?: string },
  ) {
    await this.assertQuoteVisible(actor, quoteId);
    const quote = await this.prisma.quote.findUnique({
      where: { id: quoteId },
      select: { id: true, status: true },
    });
    if (!quote) throw new NotFoundException('Cotización no encontrada');
    assertQuoteStatusEditable(quote.status);

    const qty = new Prisma.Decimal(dto.quantity);
    if (qty.lte(0)) {
      throw new BadRequestException('La cantidad debe ser mayor a cero');
    }

    if (dto.lineType === QuoteLineType.PART) {
      const hasInv = Boolean(dto.inventoryItemId?.trim());
      const hasAdHoc = Boolean(dto.adHocPart?.name?.trim());
      if (hasInv === hasAdHoc) {
        throw new BadRequestException(
          'La línea PART requiere exactamente uno: `inventoryItemId` (catálogo) o `adHocPart` (repuesto nuevo sin stock).',
        );
      }
      if (dto.serviceId) {
        throw new BadRequestException('La línea PART no admite serviceId');
      }
    } else {
      if (!dto.description?.trim() && !dto.serviceId) {
        throw new BadRequestException('La línea LABOR requiere descripción o servicio del catálogo');
      }
      if (dto.inventoryItemId || dto.adHocPart) {
        throw new BadRequestException('La línea LABOR no admite repuesto');
      }
    }

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

    const mayFinancials = actorMayViewQuoteFinancials(actor);
    let unitPriceForSave =
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

    const { line, stubInventoryId } = await this.prisma.$transaction(async (tx) => {
      await tx.quote.findUniqueOrThrow({ where: { id: quoteId }, select: { id: true } });

      const maxSort = await tx.quoteLine.aggregate({
        where: { quoteId },
        _max: { sortOrder: true },
      });
      const sortOrder = (maxSort._max.sortOrder ?? -1) + 1;

      if (dto.lineType === QuoteLineType.LABOR) {
        const descriptionForSave = dto.description?.trim() || resolvedServiceDescription || '';
        const created = await tx.quoteLine.create({
          data: {
            quoteId,
            lineType: QuoteLineType.LABOR,
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
          include: quoteLineInclude,
        });
        return { line: created, stubInventoryId: null as string | null };
      }

      let inventoryItemId: string;
      let stubInventoryId: string | null = null;

      if (dto.inventoryItemId?.trim()) {
        const item = await tx.inventoryItem.findUnique({
          where: { id: dto.inventoryItemId.trim() },
          include: { measurementUnit: { select: { slug: true } } },
        });
        if (!item || !item.isActive) {
          throw new NotFoundException('Ítem de inventario no encontrado');
        }
        assertPartQuantityMatchesMeasurementUnit(qty, item.measurementUnit.slug);
        inventoryItemId = item.id;
      } else {
        const ad = dto.adHocPart!;
        const measurementUnitId = await this.adHocSku.measurementUnitIdForSlug(
          tx,
          ad.measurementUnitSlug,
        );
        const stub = await this.adHocSku.createQuotedPartStub(tx, {
          name: ad.name,
          reference: ad.reference,
          measurementUnitId,
        });
        stubInventoryId = stub.id;
        inventoryItemId = stub.id;
        assertPartQuantityMatchesMeasurementUnit(qty, stub.measurementUnit.slug);
      }

      const created = await tx.quoteLine.create({
        data: {
          quoteId,
          lineType: QuoteLineType.PART,
          sortOrder,
          inventoryItemId,
          taxRateId: taxRateIdForSave,
          taxRatePercentSnapshot: taxRatePercentSnapshotForSave,
          description: dto.description?.trim() ?? null,
          quantity: qty,
          unitPrice: unitPriceForSave,
          discountAmount: discountForSave,
        },
        include: quoteLineInclude,
      });

      return { line: created, stubInventoryId };
    });

    await this.audit.recordDomain({
      actorUserId: actor.sub,
      action: 'quote_lines.created',
      entityType: 'QuoteLine',
      entityId: line.id,
      previousPayload: null,
      nextPayload: {
        quoteId,
        lineType: line.lineType,
        quantity: dto.quantity,
        stubInventoryId,
      },
      ipAddress: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    });

    if (stubInventoryId) {
      await this.audit.recordDomain({
        actorUserId: actor.sub,
        action: 'inventory_items.created',
        entityType: 'InventoryItem',
        entityId: stubInventoryId,
        previousPayload: null,
        nextPayload: { origin: 'quote_ad_hoc', quoteId },
        ipAddress: meta.ip ?? null,
        userAgent: meta.userAgent ?? null,
      });
    }

    const mayFin = actorMayViewQuoteFinancials(actor);
    const lineForTotals: LineForTotals = {
      id: line.id,
      lineType: quoteLineTypeToWorkOrderLineType(line.lineType),
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      discountAmount: line.discountAmount,
      costSnapshot: null,
      taxRateId: line.taxRateId,
      taxRatePercentSnapshot: line.taxRatePercentSnapshot,
      taxRate: line.taxRate ? { kind: line.taxRate.kind } : null,
    };
    const withTotals = {
      ...line,
      totals: serializeLineTotals(computeLineTotals(lineForTotals)),
    };
    if (mayFin) return quotesJsonSafe(withTotals);
    return quotesJsonSafe({
      ...withTotals,
      unitPrice: null,
      discountAmount: null,
      totals: null,
      inventoryItem: withTotals.inventoryItem
        ? { ...withTotals.inventoryItem, averageCost: null }
        : null,
    });
  }

  async updateLine(
    quoteId: string,
    lineId: string,
    actor: JwtUserPayload,
    dto: UpdateQuoteLineDto,
    meta: { ip?: string; userAgent?: string },
  ) {
    await this.assertQuoteVisible(actor, quoteId);
    const quote = await this.prisma.quote.findUnique({
      where: { id: quoteId },
      select: { status: true },
    });
    if (!quote) throw new NotFoundException('Cotización no encontrada');
    assertQuoteStatusEditable(quote.status);

    const keys = Object.keys(dto).filter((k) => dto[k as keyof UpdateQuoteLineDto] !== undefined);
    if (keys.length === 0) {
      throw new BadRequestException('No hay campos para actualizar');
    }

    if (
      (dto.unitPrice !== undefined || dto.discountAmount !== undefined) &&
      !actorMayViewQuoteFinancials(actor)
    ) {
      throw new ForbiddenException(
        'No tenés permiso para cargar o cambiar importes en la cotización. Pedile a caja o administración.',
      );
    }

    const existing = await this.prisma.quoteLine.findFirst({
      where: { id: lineId, quoteId },
      include: {
        inventoryItem: {
          include: { measurementUnit: { select: { slug: true } } },
        },
      },
    });
    if (!existing) {
      throw new NotFoundException('Línea no encontrada');
    }

    let qtyDec = existing.quantity;
    if (dto.quantity !== undefined) {
      if (!QTY_DECIMAL_REGEX.test(dto.quantity)) {
        throw new BadRequestException('Cantidad inválida');
      }
      qtyDec = new Prisma.Decimal(dto.quantity);
      if (qtyDec.lte(0)) {
        throw new BadRequestException('La cantidad debe ser mayor a cero');
      }
      if (existing.lineType === QuoteLineType.PART && existing.inventoryItem) {
        assertPartQuantityMatchesMeasurementUnit(qtyDec, existing.inventoryItem.measurementUnit.slug);
      }
    }

    const data: Prisma.QuoteLineUpdateInput = {};
    if (dto.quantity !== undefined) data.quantity = qtyDec;
    if (dto.unitPrice !== undefined) {
      data.unitPrice =
        dto.unitPrice === null || !String(dto.unitPrice).trim()
          ? null
          : decimalFromMoneyApiString(dto.unitPrice);
    }
    if (dto.discountAmount !== undefined) {
      data.discountAmount =
        dto.discountAmount === null || !String(dto.discountAmount).trim()
          ? null
          : decimalFromMoneyApiString(dto.discountAmount);
    }
    if (dto.description !== undefined) {
      data.description = dto.description === null ? null : dto.description.trim();
    }

    if (dto.taxRateId !== undefined) {
      if (dto.taxRateId === null || !String(dto.taxRateId).trim()) {
        data.taxRate = { disconnect: true };
        data.taxRatePercentSnapshot = null;
      } else {
        const tax = await this.prisma.taxRate.findUnique({ where: { id: dto.taxRateId.trim() } });
        if (!tax) throw new NotFoundException('Tarifa de impuesto no encontrada');
        if (!tax.isActive) {
          throw new BadRequestException('La tarifa de impuesto está desactivada');
        }
        data.taxRate = { connect: { id: tax.id } };
        data.taxRatePercentSnapshot = tax.ratePercent;
      }
    }

    const line = await this.prisma.quoteLine.update({
      where: { id: lineId },
      data,
      include: quoteLineInclude,
    });

    await this.audit.recordDomain({
      actorUserId: actor.sub,
      action: 'quote_lines.updated',
      entityType: 'QuoteLine',
      entityId: lineId,
      previousPayload: { quoteId },
      nextPayload: dto,
      ipAddress: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    });

    const lineForTotals: LineForTotals = {
      id: line.id,
      lineType: quoteLineTypeToWorkOrderLineType(line.lineType),
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      discountAmount: line.discountAmount,
      costSnapshot: null,
      taxRateId: line.taxRateId,
      taxRatePercentSnapshot: line.taxRatePercentSnapshot,
      taxRate: line.taxRate ? { kind: line.taxRate.kind } : null,
    };
    const mayFin = actorMayViewQuoteFinancials(actor);
    const withTotals = {
      ...line,
      totals: serializeLineTotals(computeLineTotals(lineForTotals)),
    };
    if (mayFin) return quotesJsonSafe(withTotals);
    return quotesJsonSafe({
      ...withTotals,
      unitPrice: null,
      discountAmount: null,
      totals: null,
    });
  }

  async deleteLine(quoteId: string, lineId: string, actor: JwtUserPayload, meta: { ip?: string; userAgent?: string }) {
    await this.assertQuoteVisible(actor, quoteId);
    const quote = await this.prisma.quote.findUnique({
      where: { id: quoteId },
      select: { status: true },
    });
    if (!quote) throw new NotFoundException('Cotización no encontrada');
    assertQuoteStatusEditable(quote.status);

    const existing = await this.prisma.quoteLine.findFirst({
      where: { id: lineId, quoteId },
    });
    if (!existing) {
      throw new NotFoundException('Línea no encontrada');
    }

    await this.prisma.quoteLine.delete({ where: { id: lineId } });

    await this.audit.recordDomain({
      actorUserId: actor.sub,
      action: 'quote_lines.deleted',
      entityType: 'QuoteLine',
      entityId: lineId,
      previousPayload: { quoteId, lineType: existing.lineType },
      nextPayload: null,
      ipAddress: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    });

    return { ok: true };
  }

  /**
   * Cotización aceptada → alta de cliente + vehículo en maestro y vínculo a la cotización.
   */
  async saveQuoteToMaster(
    id: string,
    actor: JwtUserPayload,
    meta: { ip?: string; userAgent?: string },
  ) {
    await this.assertQuoteVisible(actor, id);
    const quote = await this.prisma.quote.findUnique({
      where: { id },
      include: { vehicle: vehicleWithCustomer },
    });
    if (!quote) throw new NotFoundException('Cotización no encontrada');
    if (quote.status !== QuoteStatus.ACCEPTED) {
      throw new BadRequestException('Solo cotizaciones aceptadas pueden guardarse como cliente.');
    }
    if (quote.vehicleId) {
      throw new BadRequestException('Esta cotización ya está vinculada a un vehículo del maestro.');
    }

    const displayName = pickNonEmpty(quote.customerName, quote.vehicle?.customer?.displayName);
    const plateRaw = pickNonEmpty(quote.vehiclePlate, quote.vehicle?.plate);
    if (!displayName) {
      throw new BadRequestException('Se requiere nombre del cliente para dar de alta el maestro.');
    }
    if (!plateRaw) {
      throw new BadRequestException('Se requiere placa del vehículo para dar de alta el maestro.');
    }

    const plateNorm = normalizeVehiclePlate(plateRaw);
    const phone = pickNonEmpty(quote.customerPhone, quote.vehicle?.customer?.primaryPhone);
    const email = pickNonEmpty(quote.customerEmail, quote.vehicle?.customer?.email);

    const row = await this.prisma.$transaction(async (tx) => {
        const cust = await tx.customer.create({
          data: {
            displayName,
            primaryPhone: phone ?? null,
            email: email?.trim().toLowerCase() ?? null,
          },
        });

        let veh;
        try {
          veh = await tx.vehicle.create({
            data: {
              customerId: cust.id,
              plate: plateRaw.trim(),
              plateNorm,
              brand: pickNonEmpty(quote.vehicleBrand, quote.vehicle?.brand),
              model: pickNonEmpty(quote.vehicleModel, quote.vehicle?.model),
            },
          });
        } catch (e) {
          if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
            throw new ConflictException('Ya existe un vehículo con esa placa.');
          }
          throw e;
        }

        return tx.quote.update({
          where: { id },
          data: {
            vehicle: { connect: { id: veh.id } },
            customerName: displayName,
            customerPhone: phone ?? null,
            customerEmail: email ?? null,
            vehiclePlate: plateRaw.trim(),
            vehicleBrand: pickNonEmpty(quote.vehicleBrand, quote.vehicle?.brand) ?? null,
            vehicleModel: pickNonEmpty(quote.vehicleModel, quote.vehicle?.model) ?? null,
          },
          include: {
            createdBy: userBrief,
            vehicle: vehicleWithCustomer,
            lines: { orderBy: { sortOrder: 'asc' }, include: quoteLineInclude },
          },
        });
    });

    await this.audit.recordDomain({
      actorUserId: actor.sub,
      action: 'quotes.persisted_to_master',
      entityType: 'Quote',
      entityId: id,
      previousPayload: null,
      nextPayload: { customerPersisted: true },
      ipAddress: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    });

    return this.shapeQuoteDetail(row, actor);
  }

  async deleteQuote(id: string, actor: JwtUserPayload, meta: { ip?: string; userAgent?: string }) {
    await this.assertQuoteVisible(actor, id);
    const row = await this.prisma.quote.findUnique({
      where: { id },
      select: {
        status: true,
        publicCode: true,
      },
    });
    if (!row) throw new NotFoundException('Cotización no encontrada');
    if (
      row.status !== QuoteStatus.CANCELLED &&
      row.status !== QuoteStatus.REJECTED &&
      row.status !== QuoteStatus.DRAFT
    ) {
      throw new BadRequestException(
        'Solo se pueden borrar cotizaciones en borrador, rechazada o anulada.',
      );
    }

    await this.prisma.quote.delete({ where: { id } });

    await this.audit.recordDomain({
      actorUserId: actor.sub,
      action: 'quotes.deleted',
      entityType: 'Quote',
      entityId: id,
      previousPayload: { status: row.status, publicCode: row.publicCode },
      nextPayload: null,
      ipAddress: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    });

    return { ok: true };
  }
}
