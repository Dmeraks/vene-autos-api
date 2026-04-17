import { BadRequestException, Injectable } from '@nestjs/common';
import {
  CashMovementDirection,
  InvoiceDispatchStatus,
  InvoiceStatus,
  Prisma,
  SaleStatus,
  WorkOrderStatus,
} from '@prisma/client';
import * as XLSX from 'xlsx';
import { ceilWholeCop } from '../../common/money/cop-money';
import {
  computeBillingTotals,
  type LineForTotals,
} from '../../common/billing/billing-totals';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CASH_EXPENSE_REQUEST_REFERENCE_TYPE,
  CASH_INVOICE_REFERENCE_TYPE,
  CASH_PURCHASE_RECEIPT_REFERENCE_TYPE,
  CASH_SALE_REFERENCE_TYPE,
  CASH_WORK_ORDER_REFERENCE_TYPE,
} from '../cash/cash.constants';
import type { CashJournalQueryDto } from './dto/cash-journal.query.dto';
import type { DianStatusQueryDto } from './dto/dian-status.query.dto';
import type {
  EconomicSummaryQueryDto,
  ReportGranularity,
} from './dto/economic-summary.query.dto';
import type { ProfitabilityByServiceQueryDto } from './dto/profitability-by-service.query.dto';
import type { ProfitabilityByTechnicianQueryDto } from './dto/profitability-by-technician.query.dto';
import type {
  RevenueUnifiedGranularity,
  RevenueUnifiedQueryDto,
} from './dto/revenue-unified.query.dto';
import type { SaleProfitabilityQueryDto } from './dto/sale-profitability.query.dto';
import type { SalesByPaymentMethodQueryDto } from './dto/sales-by-payment-method.query.dto';
import type { StockCriticalQueryDto } from './dto/stock-critical.query.dto';
import type { TaxCausadoQueryDto } from './dto/tax-causado.query.dto';
import type { WorkOrderProfitabilityQueryDto } from './dto/work-order-profitability.query.dto';

type Acc = {
  income: Prisma.Decimal;
  expense: Prisma.Decimal;
  otPayments: Prisma.Decimal;
  opened: number;
  delivered: number;
  vehicleIds: Set<string>;
};

function dayBoundsUtc(ymd: string): { start: Date; end: Date } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) throw new BadRequestException('Fecha inválida');
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const start = new Date(Date.UTC(y, mo - 1, d, 0, 0, 0, 0));
  const end = new Date(Date.UTC(y, mo - 1, d, 23, 59, 59, 999));
  return { start, end };
}

function startOfUtcWeek(d: Date): Date {
  const x = new Date(d.getTime());
  const dow = x.getUTCDay();
  const diff = (dow + 6) % 7;
  x.setUTCDate(x.getUTCDate() - diff);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

function periodKey(d: Date, g: ReportGranularity | RevenueUnifiedGranularity): string {
  const y = d.getUTCFullYear();
  const mo = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const mStr = String(mo).padStart(2, '0');
  const dStr = String(day).padStart(2, '0');
  if (g === 'day') return `${y}-${mStr}-${dStr}`;
  if (g === 'month') return `${y}-${mStr}`;
  if (g === 'fortnight') {
    const half = day <= 15 ? '1' : '2';
    return `${y}-${mStr}-${half}`;
  }
  const w0 = startOfUtcWeek(d);
  const wy = w0.getUTCFullYear();
  const wm = String(w0.getUTCMonth() + 1).padStart(2, '0');
  const wd = String(w0.getUTCDate()).padStart(2, '0');
  return `${wy}-${wm}-${wd}`;
}

function periodLabel(key: string, g: ReportGranularity | RevenueUnifiedGranularity): string {
  if (g === 'day') return key;
  if (g === 'month') return key;
  if (g === 'fortnight') {
    const [y, m, h] = key.split('-');
    return h === '1' ? `${y}-${m} (1.ª quincena)` : `${y}-${m} (2.ª quincena)`;
  }
  return `Semana desde ${key}`;
}

function emptyAcc(): Acc {
  return {
    income: new Prisma.Decimal(0),
    expense: new Prisma.Decimal(0),
    otPayments: new Prisma.Decimal(0),
    opened: 0,
    delivered: 0,
    vehicleIds: new Set(),
  };
}

function decStr(n: Prisma.Decimal): string {
  return ceilWholeCop(n).toString();
}

/** Shape para cargar líneas de OT/Sale desde Prisma y pasarlas a `computeBillingTotals`. */
const lineTotalsSelect = {
  id: true,
  lineType: true,
  quantity: true,
  unitPrice: true,
  discountAmount: true,
  costSnapshot: true,
  taxRateId: true,
  taxRatePercentSnapshot: true,
  taxRate: { select: { kind: true } },
} as const;

function lineRowsToLinesForTotals(
  rows: Array<{
    id: string;
    lineType: string;
    quantity: Prisma.Decimal;
    unitPrice: Prisma.Decimal | null;
    discountAmount: Prisma.Decimal | null;
    costSnapshot: Prisma.Decimal | null;
    taxRateId: string | null;
    taxRatePercentSnapshot: Prisma.Decimal | null;
    taxRate: { kind: 'VAT' | 'INC' } | null;
  }>,
): LineForTotals[] {
  return rows.map((r) => ({
    id: r.id,
    lineType: r.lineType as LineForTotals['lineType'],
    quantity: r.quantity,
    unitPrice: r.unitPrice,
    discountAmount: r.discountAmount,
    costSnapshot: r.costSnapshot,
    taxRateId: r.taxRateId,
    taxRatePercentSnapshot: r.taxRatePercentSnapshot,
    taxRate: r.taxRate,
  }));
}

/** Etiqueta legible para el tipo de referencia de un movimiento de caja. */
function referenceTypeLabel(refType: string | null): string {
  if (!refType) return 'Manual';
  switch (refType) {
    case CASH_EXPENSE_REQUEST_REFERENCE_TYPE:
      return 'Solicitud de egreso';
    case CASH_WORK_ORDER_REFERENCE_TYPE:
      return 'Orden de trabajo';
    case CASH_SALE_REFERENCE_TYPE:
      return 'Venta';
    case CASH_INVOICE_REFERENCE_TYPE:
      return 'Factura';
    case CASH_PURCHASE_RECEIPT_REFERENCE_TYPE:
      return 'Recepción de compra';
    default:
      return refType;
  }
}

/**
 * Fase 8 · Validación compartida de rangos YYYY-MM-DD. Convierte a bordes UTC y enforce
 * tope de 366 días para no generar reportes absurdos (y proteger la DB).
 */
function parseReportRangeOrThrow(fromYmd: string, toYmd: string): { from: Date; to: Date } {
  const { start: from } = dayBoundsUtc(fromYmd);
  const { end: to } = dayBoundsUtc(toYmd);
  if (from > to) {
    throw new BadRequestException('«desde» debe ser anterior o igual a «hasta»');
  }
  const spanMs = to.getTime() - from.getTime();
  if (spanMs > 366 * 86400000) {
    throw new BadRequestException('El rango máximo es 366 días');
  }
  return { from, to };
}

/**
 * Fase 8 · Mapa de slugs de caja a medios de pago operativos + fallback. Si aparece un
 * slug desconocido (p. ej. legado o agregado por el admin) se muestra como «Otro medio».
 */
const PAYMENT_METHOD_LABELS: Record<string, string> = {
  ingreso_cobro: 'Efectivo',
  ingreso_transferencia: 'Transferencia',
  ingreso_tarjeta: 'Tarjeta',
  ingreso_nequi: 'Nequi',
  ingreso_daviplata: 'Daviplata',
  ingreso_otro: 'Otro ingreso',
};

function paymentMethodLabel(slug: string | null, categoryName: string | null): string {
  if (!slug) return categoryName ?? 'Sin categoría';
  return PAYMENT_METHOD_LABELS[slug] ?? categoryName ?? slug;
}

/** Referencias a comprobantes de venta (operaciones que pueden cobrarse en caja). */
const SALE_LIKE_REFERENCE_TYPES = [
  CASH_WORK_ORDER_REFERENCE_TYPE,
  CASH_SALE_REFERENCE_TYPE,
  CASH_INVOICE_REFERENCE_TYPE,
] as const;

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async economicSummary(query: EconomicSummaryQueryDto) {
    const { start: from } = dayBoundsUtc(query.from);
    const { end: to } = dayBoundsUtc(query.to);
    if (from > to) {
      throw new BadRequestException('«desde» debe ser anterior o igual a «hasta»');
    }
    const spanMs = to.getTime() - from.getTime();
    if (spanMs > 366 * 86400000) {
      throw new BadRequestException('El rango máximo es 366 días');
    }

    const g: ReportGranularity = query.granularity ?? 'day';

    const [movements, payments, openedWo, deliveredWo] = await Promise.all([
      this.prisma.cashMovement.findMany({
        where: { createdAt: { gte: from, lte: to } },
        select: { createdAt: true, direction: true, amount: true },
      }),
      this.prisma.workOrderPayment.findMany({
        where: { createdAt: { gte: from, lte: to } },
        select: { createdAt: true, amount: true },
      }),
      this.prisma.workOrder.findMany({
        where: { createdAt: { gte: from, lte: to } },
        select: { id: true, createdAt: true, vehicleId: true },
      }),
      this.prisma.workOrder.findMany({
        where: { deliveredAt: { gte: from, lte: to, not: null } },
        select: { id: true, deliveredAt: true, vehicleId: true },
      }),
    ]);

    const buckets = new Map<string, Acc>();

    function touch(key: string): Acc {
      let a = buckets.get(key);
      if (!a) {
        a = emptyAcc();
        buckets.set(key, a);
      }
      return a;
    }

    for (const m of movements) {
      const k = periodKey(m.createdAt, g);
      const a = touch(k);
      if (m.direction === CashMovementDirection.INCOME) {
        a.income = a.income.plus(m.amount);
      } else {
        a.expense = a.expense.plus(m.amount);
      }
    }

    for (const p of payments) {
      const k = periodKey(p.createdAt, g);
      const a = touch(k);
      a.otPayments = a.otPayments.plus(p.amount);
    }

    for (const w of openedWo) {
      const k = periodKey(w.createdAt, g);
      const a = touch(k);
      a.opened += 1;
      if (w.vehicleId) a.vehicleIds.add(w.vehicleId);
    }

    for (const w of deliveredWo) {
      if (!w.deliveredAt) continue;
      const k = periodKey(w.deliveredAt, g);
      const a = touch(k);
      a.delivered += 1;
      if (w.vehicleId) a.vehicleIds.add(w.vehicleId);
    }

    const keys = [...buckets.keys()].sort();
    const series = keys.map((periodKey) => {
      const a = buckets.get(periodKey)!;
      const net = a.income.minus(a.expense);
      return {
        periodKey,
        periodLabel: periodLabel(periodKey, g),
        incomeTotal: decStr(a.income),
        expenseTotal: decStr(a.expense),
        netCash: decStr(net),
        otPaymentsTotal: decStr(a.otPayments),
        workOrdersOpened: a.opened,
        workOrdersDelivered: a.delivered,
        distinctVehiclesTouched: a.vehicleIds.size,
      };
    });

    let tin = new Prisma.Decimal(0);
    let tex = new Prisma.Decimal(0);
    let totp = new Prisma.Decimal(0);
    let o = 0;
    let del = 0;
    for (const a of buckets.values()) {
      tin = tin.plus(a.income);
      tex = tex.plus(a.expense);
      totp = totp.plus(a.otPayments);
      o += a.opened;
      del += a.delivered;
    }

    const distinctVehiclesPeriod = new Set<string>();
    for (const w of openedWo) {
      if (w.vehicleId) distinctVehiclesPeriod.add(w.vehicleId);
    }
    for (const w of deliveredWo) {
      if (w.vehicleId) distinctVehiclesPeriod.add(w.vehicleId);
    }

    return {
      from: query.from,
      to: query.to,
      granularity: g,
      disclaimer:
        'Los importes provienen de movimientos de caja y cobros en OT. Margen bruto/neto sobre costo de repuestos no está calculado en esta versión.',
      series,
      totals: {
        incomeTotal: decStr(tin),
        expenseTotal: decStr(tex),
        otPaymentsTotal: decStr(totp),
        netCash: decStr(tin.minus(tex)),
        workOrdersOpened: o,
        workOrdersDelivered: del,
        distinctVehiclesTouched: distinctVehiclesPeriod.size,
      },
    };
  }

  /**
   * Ingresos unificados (Venta + OT + Factura) deduplicando el camino
   * Factura → Sale/WO. Usa el grandTotal del **documento canónico** de cada
   * evento de ingreso (ver `revenue-unified.query.dto.ts`).
   */
  async revenueUnified(query: RevenueUnifiedQueryDto) {
    const { start: from } = dayBoundsUtc(query.from);
    const { end: to } = dayBoundsUtc(query.to);
    if (from > to) {
      throw new BadRequestException('«desde» debe ser anterior o igual a «hasta»');
    }
    const spanMs = to.getTime() - from.getTime();
    if (spanMs > 366 * 86400000) {
      throw new BadRequestException('El rango máximo es 366 días');
    }

    const g: RevenueUnifiedGranularity = query.granularity ?? 'day';

    /**
     * Facturas emitidas no anuladas dentro del rango. `issuedAt` manda si existe;
     * si no (modo persona natural sin DIAN), usamos `createdAt` como fecha del
     * evento de ingreso para que no queden fuera del reporte.
     */
    const invoices = await this.prisma.invoice.findMany({
      where: {
        status: { not: InvoiceStatus.VOIDED },
        OR: [
          { issuedAt: { gte: from, lte: to } },
          { AND: [{ issuedAt: null }, { createdAt: { gte: from, lte: to } }] },
        ],
      },
      select: {
        id: true,
        issuedAt: true,
        createdAt: true,
        grandTotal: true,
        saleId: true,
        workOrderId: true,
        documentNumber: true,
      },
    });

    const consumedSaleIds = new Set<string>();
    const consumedWorkOrderIds = new Set<string>();
    for (const inv of invoices) {
      if (inv.saleId) consumedSaleIds.add(inv.saleId);
      if (inv.workOrderId) consumedWorkOrderIds.add(inv.workOrderId);
    }

    /**
     * Ventas confirmadas en el rango. Si ya hay factura para la venta, la venta
     * queda cubierta por el paso de facturas y no se cuenta aquí.
     */
    const sales = await this.prisma.sale.findMany({
      where: {
        status: SaleStatus.CONFIRMED,
        confirmedAt: { gte: from, lte: to, not: null },
      },
      select: {
        id: true,
        confirmedAt: true,
        createdAt: true,
        publicCode: true,
        originWorkOrderId: true,
        lines: { select: lineTotalsSelect },
      },
    });

    const usedSales = sales.filter((s) => !consumedSaleIds.has(s.id));
    for (const s of usedSales) {
      if (s.originWorkOrderId) consumedWorkOrderIds.add(s.originWorkOrderId);
    }

    /**
     * OTs entregadas en el rango y no cubiertas ya por venta o factura.
     */
    const workOrders = await this.prisma.workOrder.findMany({
      where: {
        status: WorkOrderStatus.DELIVERED,
        deliveredAt: { gte: from, lte: to, not: null },
      },
      select: {
        id: true,
        deliveredAt: true,
        publicCode: true,
        lines: { select: lineTotalsSelect },
      },
    });

    const usedWorkOrders = workOrders.filter((w) => !consumedWorkOrderIds.has(w.id));

    type Bucket = {
      invoices: Prisma.Decimal;
      sales: Prisma.Decimal;
      workOrders: Prisma.Decimal;
      count: number;
    };
    const buckets = new Map<string, Bucket>();
    const touch = (key: string): Bucket => {
      let b = buckets.get(key);
      if (!b) {
        b = {
          invoices: new Prisma.Decimal(0),
          sales: new Prisma.Decimal(0),
          workOrders: new Prisma.Decimal(0),
          count: 0,
        };
        buckets.set(key, b);
      }
      return b;
    };

    let invoicesTotal = new Prisma.Decimal(0);
    let salesTotal = new Prisma.Decimal(0);
    let workOrdersTotal = new Prisma.Decimal(0);

    for (const inv of invoices) {
      const date = inv.issuedAt ?? inv.createdAt;
      const key = periodKey(date, g);
      const b = touch(key);
      b.invoices = b.invoices.plus(inv.grandTotal);
      b.count += 1;
      invoicesTotal = invoicesTotal.plus(inv.grandTotal);
    }

    for (const s of usedSales) {
      const totals = computeBillingTotals(lineRowsToLinesForTotals(s.lines as typeof s.lines));
      const date = s.confirmedAt ?? s.createdAt;
      const key = periodKey(date, g);
      const b = touch(key);
      b.sales = b.sales.plus(totals.grandTotal);
      b.count += 1;
      salesTotal = salesTotal.plus(totals.grandTotal);
    }

    for (const w of usedWorkOrders) {
      if (!w.deliveredAt) continue;
      const totals = computeBillingTotals(lineRowsToLinesForTotals(w.lines as typeof w.lines));
      const key = periodKey(w.deliveredAt, g);
      const b = touch(key);
      b.workOrders = b.workOrders.plus(totals.grandTotal);
      b.count += 1;
      workOrdersTotal = workOrdersTotal.plus(totals.grandTotal);
    }

    const keys = [...buckets.keys()].sort();
    const series = keys.map((k) => {
      const b = buckets.get(k)!;
      const total = b.invoices.plus(b.sales).plus(b.workOrders);
      return {
        periodKey: k,
        periodLabel: periodLabel(k, g),
        invoicesTotal: decStr(b.invoices),
        salesTotal: decStr(b.sales),
        workOrdersTotal: decStr(b.workOrders),
        grandTotal: decStr(total),
        documentCount: b.count,
      };
    });

    const grand = invoicesTotal.plus(salesTotal).plus(workOrdersTotal);

    return {
      from: query.from,
      to: query.to,
      granularity: g,
      disclaimer:
        'Documento canónico por evento: Factura > Venta > OT. Se deduplica Factura→Sale/WO y Sale→WO para no inflar cifras. Facturas VOIDED y ventas CANCELLED se excluyen.',
      series,
      counts: {
        invoices: invoices.length,
        sales: usedSales.length,
        workOrders: usedWorkOrders.length,
      },
      totals: {
        invoicesTotal: decStr(invoicesTotal),
        salesTotal: decStr(salesTotal),
        workOrdersTotal: decStr(workOrdersTotal),
        grandTotal: decStr(grand),
        documentCount: invoices.length + usedSales.length + usedWorkOrders.length,
      },
    };
  }

  /**
   * Rentabilidad por OT entregada en el rango. Margen = ingreso − costo (snapshot).
   * Si alguna línea PART no tiene `costSnapshot`, la OT queda `costUnknown=true`
   * y no agrega a los totales agregados.
   */
  async workOrderProfitability(query: WorkOrderProfitabilityQueryDto) {
    const { start: from } = dayBoundsUtc(query.from);
    const { end: to } = dayBoundsUtc(query.to);
    if (from > to) {
      throw new BadRequestException('«desde» debe ser anterior o igual a «hasta»');
    }
    const spanMs = to.getTime() - from.getTime();
    if (spanMs > 366 * 86400000) {
      throw new BadRequestException('El rango máximo es 366 días');
    }

    const rows = await this.prisma.workOrder.findMany({
      where: {
        status: WorkOrderStatus.DELIVERED,
        deliveredAt: { gte: from, lte: to, not: null },
      },
      orderBy: { deliveredAt: 'asc' },
      select: {
        id: true,
        publicCode: true,
        orderNumber: true,
        customerName: true,
        vehiclePlate: true,
        deliveredAt: true,
        assignedTo: { select: { id: true, fullName: true, email: true } },
        lines: { select: lineTotalsSelect },
      },
    });

    let revenueTotal = new Prisma.Decimal(0);
    let costTotal = new Prisma.Decimal(0);
    let profitTotal = new Prisma.Decimal(0);
    let countedRows = 0;

    const items = rows.map((wo) => {
      const totals = computeBillingTotals(lineRowsToLinesForTotals(wo.lines as typeof wo.lines));
      const costUnknown = totals.totalCost === null;
      const revenueAfterTax = totals.grandTotal;
      const cost = totals.totalCost;
      const profit = totals.totalProfit;

      if (!costUnknown && cost !== null && profit !== null) {
        revenueTotal = revenueTotal.plus(revenueAfterTax);
        costTotal = costTotal.plus(cost);
        profitTotal = profitTotal.plus(profit);
        countedRows += 1;
      }

      const marginPct =
        !costUnknown && profit !== null && revenueAfterTax.gt(0)
          ? profit.mul(100).div(revenueAfterTax).toDecimalPlaces(2).toString()
          : null;

      return {
        workOrderId: wo.id,
        publicCode: wo.publicCode,
        orderNumber: wo.orderNumber,
        customerName: wo.customerName,
        vehiclePlate: wo.vehiclePlate,
        deliveredAt: wo.deliveredAt?.toISOString() ?? null,
        assignedTo: wo.assignedTo
          ? { id: wo.assignedTo.id, fullName: wo.assignedTo.fullName, email: wo.assignedTo.email }
          : null,
        lineCount: totals.lineCount,
        grandTotal: totals.grandTotal.toString(),
        totalCost: cost ? cost.toString() : null,
        totalProfit: profit ? profit.toString() : null,
        marginPct,
        costUnknown,
      };
    });

    const marginPctAvg =
      countedRows > 0 && revenueTotal.gt(0)
        ? profitTotal.mul(100).div(revenueTotal).toDecimalPlaces(2).toString()
        : null;

    return {
      from: query.from,
      to: query.to,
      disclaimer:
        'Ingreso = grandTotal (subtotal − descuento + impuesto). Costo = suma de snapshots de costo de repuestos al crear la línea. Las OT con líneas PART sin costSnapshot se excluyen del total agregado.',
      rows: items,
      totals: {
        workOrdersConsidered: rows.length,
        workOrdersCounted: countedRows,
        revenueTotal: decStr(revenueTotal),
        costTotal: decStr(costTotal),
        profitTotal: decStr(profitTotal),
        marginPctAvg,
      },
    };
  }

  /** Devuelve filas del libro diario listas para tabla/XLSX. No formatea montos: el cliente decide. */
  async cashJournal(query: CashJournalQueryDto) {
    const { start: from } = dayBoundsUtc(query.from);
    const { end: to } = dayBoundsUtc(query.to);
    if (from > to) {
      throw new BadRequestException('«desde» debe ser anterior o igual a «hasta»');
    }
    const spanMs = to.getTime() - from.getTime();
    if (spanMs > 366 * 86400000) {
      throw new BadRequestException('El rango máximo es 366 días');
    }

    const rows = await this.prisma.cashMovement.findMany({
      where: {
        createdAt: { gte: from, lte: to },
        ...(query.sessionId ? { sessionId: query.sessionId } : {}),
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        sessionId: true,
        createdAt: true,
        direction: true,
        amount: true,
        note: true,
        referenceType: true,
        referenceId: true,
        category: { select: { slug: true, name: true } },
        createdBy: { select: { id: true, fullName: true, email: true } },
      },
    });

    let incomeTotal = new Prisma.Decimal(0);
    let expenseTotal = new Prisma.Decimal(0);
    const items = rows.map((r) => {
      if (r.direction === CashMovementDirection.INCOME) {
        incomeTotal = incomeTotal.plus(r.amount);
      } else {
        expenseTotal = expenseTotal.plus(r.amount);
      }
      return {
        id: r.id,
        sessionId: r.sessionId,
        createdAt: r.createdAt.toISOString(),
        direction: r.direction,
        amount: r.amount.toString(),
        category: r.category ? { slug: r.category.slug, name: r.category.name } : null,
        referenceType: r.referenceType,
        referenceTypeLabel: referenceTypeLabel(r.referenceType),
        referenceId: r.referenceId,
        note: r.note,
        createdBy: r.createdBy
          ? { id: r.createdBy.id, fullName: r.createdBy.fullName, email: r.createdBy.email }
          : null,
      };
    });

    return {
      from: query.from,
      to: query.to,
      sessionId: query.sessionId ?? null,
      rows: items,
      totals: {
        count: rows.length,
        incomeTotal: decStr(incomeTotal),
        expenseTotal: decStr(expenseTotal),
        netTotal: decStr(incomeTotal.minus(expenseTotal)),
      },
    };
  }

  /** Libro diario como archivo XLSX (Buffer para respuesta HTTP). */
  async cashJournalXlsx(query: CashJournalQueryDto): Promise<{ buffer: Buffer; filename: string }> {
    const journal = await this.cashJournal(query);

    const header = [
      'ID',
      'Sesión',
      'Fecha (UTC)',
      'Hora (UTC)',
      'Dirección',
      'Monto',
      'Categoría',
      'Tipo de referencia',
      'ID referencia',
      'Nota',
      'Creado por',
    ];

    const body = journal.rows.map((r) => {
      const d = new Date(r.createdAt);
      const ymd = d.toISOString().slice(0, 10);
      const hms = d.toISOString().slice(11, 19);
      return [
        r.id,
        r.sessionId,
        ymd,
        hms,
        r.direction === 'INCOME' ? 'Ingreso' : 'Egreso',
        Number.parseFloat(r.amount),
        r.category?.name ?? '',
        r.referenceTypeLabel,
        r.referenceId ?? '',
        r.note ?? '',
        r.createdBy?.fullName ?? r.createdBy?.email ?? '',
      ];
    });

    const footer = [
      [],
      ['Totales', '', '', '', '', '', '', '', '', '', ''],
      ['Movimientos', journal.totals.count],
      ['Ingresos (COP)', Number.parseFloat(journal.totals.incomeTotal)],
      ['Egresos (COP)', Number.parseFloat(journal.totals.expenseTotal)],
      ['Neto (COP)', Number.parseFloat(journal.totals.netTotal)],
      ['Rango', `${journal.from} → ${journal.to}${journal.sessionId ? ` · sesión ${journal.sessionId}` : ''}`],
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([header, ...body, ...footer]);
    ws['!cols'] = [
      { wch: 26 },
      { wch: 26 },
      { wch: 12 },
      { wch: 10 },
      { wch: 10 },
      { wch: 14 },
      { wch: 22 },
      { wch: 22 },
      { wch: 26 },
      { wch: 40 },
      { wch: 26 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Libro diario');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    const tag = query.sessionId ? `_sesion-${query.sessionId.slice(0, 8)}` : '';
    const filename = `libro-diario_${query.from}_${query.to}${tag}.xlsx`;
    return { buffer, filename };
  }

  // ==========================================================================
  // Fase 8 · Reportes y paneles de negocio.
  // ==========================================================================

  /**
   * Ventas por medio de pago. Toma los `CashMovement.INCOME` en rango vinculados a
   * venta/OT/factura y los agrupa por `CashMovementCategory.slug`. El mapa
   * `PAYMENT_METHOD_LABELS` da la etiqueta humana por slug (efectivo, transferencia, etc.).
   *
   * Solo se cuenta el monto real del cobro (`amount`), NO el `tenderAmount`, para no
   * inflar el total con vueltos.
   */
  async salesByPaymentMethod(query: SalesByPaymentMethodQueryDto) {
    const { from, to } = parseReportRangeOrThrow(query.from, query.to);

    const movements = await this.prisma.cashMovement.findMany({
      where: {
        createdAt: { gte: from, lte: to },
        direction: CashMovementDirection.INCOME,
        referenceType: { in: SALE_LIKE_REFERENCE_TYPES as unknown as string[] },
      },
      select: {
        amount: true,
        referenceType: true,
        category: { select: { slug: true, name: true } },
      },
    });

    type Bucket = { slug: string; label: string; amount: Prisma.Decimal; count: number };
    const byMethod = new Map<string, Bucket>();
    let total = new Prisma.Decimal(0);

    for (const mv of movements) {
      const slug = mv.category?.slug ?? 'sin_categoria';
      const label = paymentMethodLabel(mv.category?.slug ?? null, mv.category?.name ?? null);
      const existing = byMethod.get(slug);
      if (existing) {
        existing.amount = existing.amount.plus(mv.amount);
        existing.count += 1;
      } else {
        byMethod.set(slug, {
          slug,
          label,
          amount: new Prisma.Decimal(mv.amount),
          count: 1,
        });
      }
      total = total.plus(mv.amount);
    }

    const rows = Array.from(byMethod.values())
      .sort((a, b) => (a.amount.gt(b.amount) ? -1 : a.amount.lt(b.amount) ? 1 : 0))
      .map((b) => ({
        slug: b.slug,
        label: b.label,
        amount: decStr(b.amount),
        count: b.count,
        sharePct:
          total.gt(0) ? b.amount.mul(100).div(total).toDecimalPlaces(2).toString() : null,
      }));

    return {
      from: query.from,
      to: query.to,
      disclaimer:
        'Solo movimientos de ingreso vinculados a venta, OT o factura. Slugs desconocidos se agrupan como «Otro medio». Montos en pesos (COP), redondeados al entero hacia arriba.',
      rows,
      totals: {
        count: movements.length,
        amount: decStr(total),
        methods: rows.length,
      },
    };
  }

  /**
   * Rentabilidad por venta confirmada. Mismo esquema que `workOrderProfitability`: usa
   * `costSnapshot` de cada `SaleLine`, y las ventas con líneas PART sin costSnapshot se
   * marcan `costUnknown=true` y se excluyen del total agregado.
   */
  async saleProfitability(query: SaleProfitabilityQueryDto) {
    const { from, to } = parseReportRangeOrThrow(query.from, query.to);

    const rows = await this.prisma.sale.findMany({
      where: {
        status: SaleStatus.CONFIRMED,
        confirmedAt: { gte: from, lte: to, not: null },
      },
      orderBy: { confirmedAt: 'asc' },
      select: {
        id: true,
        publicCode: true,
        saleNumber: true,
        customerName: true,
        confirmedAt: true,
        createdBy: { select: { id: true, fullName: true, email: true } },
        lines: { select: lineTotalsSelect },
      },
    });

    let revenueTotal = new Prisma.Decimal(0);
    let costTotal = new Prisma.Decimal(0);
    let profitTotal = new Prisma.Decimal(0);
    let countedRows = 0;

    const items = rows.map((sale) => {
      const totals = computeBillingTotals(lineRowsToLinesForTotals(sale.lines as typeof sale.lines));
      const costUnknown = totals.totalCost === null;
      const revenueAfterTax = totals.grandTotal;
      const cost = totals.totalCost;
      const profit = totals.totalProfit;

      if (!costUnknown && cost !== null && profit !== null) {
        revenueTotal = revenueTotal.plus(revenueAfterTax);
        costTotal = costTotal.plus(cost);
        profitTotal = profitTotal.plus(profit);
        countedRows += 1;
      }

      const marginPct =
        !costUnknown && profit !== null && revenueAfterTax.gt(0)
          ? profit.mul(100).div(revenueAfterTax).toDecimalPlaces(2).toString()
          : null;

      return {
        saleId: sale.id,
        publicCode: sale.publicCode,
        saleNumber: sale.saleNumber,
        customerName: sale.customerName,
        confirmedAt: sale.confirmedAt?.toISOString() ?? null,
        createdBy: sale.createdBy
          ? { id: sale.createdBy.id, fullName: sale.createdBy.fullName, email: sale.createdBy.email }
          : null,
        lineCount: totals.lineCount,
        grandTotal: totals.grandTotal.toString(),
        totalCost: cost ? cost.toString() : null,
        totalProfit: profit ? profit.toString() : null,
        marginPct,
        costUnknown,
      };
    });

    const marginPctAvg =
      countedRows > 0 && revenueTotal.gt(0)
        ? profitTotal.mul(100).div(revenueTotal).toDecimalPlaces(2).toString()
        : null;

    return {
      from: query.from,
      to: query.to,
      disclaimer:
        'Ingreso = grandTotal de la venta (subtotal − descuento + impuesto). Costo = suma de snapshots de costo por línea PART. Ventas con líneas PART sin costSnapshot quedan marcadas `costUnknown` y no suman al total.',
      rows: items,
      totals: {
        salesConsidered: rows.length,
        salesCounted: countedRows,
        revenueTotal: decStr(revenueTotal),
        costTotal: decStr(costTotal),
        profitTotal: decStr(profitTotal),
        marginPctAvg,
      },
    };
  }

  /**
   * IVA/INC causado. Agrupa `InvoiceLine` de facturas `ISSUED` cuyo `issuedAt` cae en rango.
   * Usa el snapshot `taxRateKindSnapshot` por línea (VAT/INC) y suma `taxAmount` + `lineTotal`
   * (base gravable = lineTotal − taxAmount). Facturas VOIDED o DRAFT no aparecen.
   */
  async taxCausado(query: TaxCausadoQueryDto) {
    const { from, to } = parseReportRangeOrThrow(query.from, query.to);

    const lines = await this.prisma.invoiceLine.findMany({
      where: {
        invoice: {
          status: InvoiceStatus.ISSUED,
          issuedAt: { gte: from, lte: to, not: null },
        },
        taxRateId: { not: null },
      },
      select: {
        lineTotal: true,
        taxAmount: true,
        taxRatePercentSnapshot: true,
        taxRateKindSnapshot: true,
        taxRateId: true,
        taxRate: { select: { id: true, slug: true, name: true, kind: true, ratePercent: true } },
      },
    });

    type Bucket = {
      taxRateId: string;
      slug: string;
      name: string;
      kind: 'VAT' | 'INC';
      ratePercent: string;
      taxableBase: Prisma.Decimal;
      taxAmount: Prisma.Decimal;
      lineCount: number;
    };
    const byRate = new Map<string, Bucket>();
    let totalTaxable = new Prisma.Decimal(0);
    let totalTax = new Prisma.Decimal(0);
    let totalVat = new Prisma.Decimal(0);
    let totalInc = new Prisma.Decimal(0);

    for (const line of lines) {
      if (!line.taxRateId || !line.taxRate) continue;
      const taxable = new Prisma.Decimal(line.lineTotal).minus(line.taxAmount);
      const bucket = byRate.get(line.taxRateId) ?? {
        taxRateId: line.taxRateId,
        slug: line.taxRate.slug,
        name: line.taxRate.name,
        kind: line.taxRate.kind,
        ratePercent: (line.taxRatePercentSnapshot ?? line.taxRate.ratePercent).toString(),
        taxableBase: new Prisma.Decimal(0),
        taxAmount: new Prisma.Decimal(0),
        lineCount: 0,
      };
      bucket.taxableBase = bucket.taxableBase.plus(taxable);
      bucket.taxAmount = bucket.taxAmount.plus(line.taxAmount);
      bucket.lineCount += 1;
      byRate.set(line.taxRateId, bucket);
      totalTaxable = totalTaxable.plus(taxable);
      totalTax = totalTax.plus(line.taxAmount);
      if (line.taxRateKindSnapshot === 'INC') {
        totalInc = totalInc.plus(line.taxAmount);
      } else {
        totalVat = totalVat.plus(line.taxAmount);
      }
    }

    const rows = Array.from(byRate.values())
      .sort((a, b) => (a.taxAmount.gt(b.taxAmount) ? -1 : a.taxAmount.lt(b.taxAmount) ? 1 : 0))
      .map((b) => ({
        taxRateId: b.taxRateId,
        slug: b.slug,
        name: b.name,
        kind: b.kind,
        ratePercent: b.ratePercent,
        taxableBase: decStr(b.taxableBase),
        taxAmount: decStr(b.taxAmount),
        lineCount: b.lineCount,
      }));

    return {
      from: query.from,
      to: query.to,
      disclaimer:
        'Solo facturas emitidas (status=ISSUED) cuyo `issuedAt` cae en el rango. Base gravable = lineTotal − impuesto por línea, usando el snapshot congelado al emitir la factura.',
      rows,
      totals: {
        lineCount: lines.length,
        taxableBase: decStr(totalTaxable),
        totalTax: decStr(totalTax),
        totalVat: decStr(totalVat),
        totalInc: decStr(totalInc),
      },
    };
  }

  /**
   * Estado DIAN. Cuenta facturas por `status` (DRAFT/ISSUED/VOIDED) creadas en el rango
   * y, para cada factura emitida, mira el último `InvoiceDispatchEvent` para ver en qué
   * estado quedó el envío. Permite ver «cuántas ISSUED están ACCEPTED vs REJECTED vs
   * sin enviar».
   */
  async dianStatus(query: DianStatusQueryDto) {
    const { from, to } = parseReportRangeOrThrow(query.from, query.to);

    const invoices = await this.prisma.invoice.findMany({
      where: { createdAt: { gte: from, lte: to } },
      select: {
        id: true,
        status: true,
        grandTotal: true,
        dispatchEvents: {
          orderBy: { requestedAt: 'desc' },
          take: 1,
          select: { status: true },
        },
      },
    });

    const byStatus: Record<InvoiceStatus, { count: number; amount: Prisma.Decimal }> = {
      DRAFT: { count: 0, amount: new Prisma.Decimal(0) },
      ISSUED: { count: 0, amount: new Prisma.Decimal(0) },
      VOIDED: { count: 0, amount: new Prisma.Decimal(0) },
    };

    type DispatchBucket = Record<InvoiceDispatchStatus | 'NO_DISPATCH', number>;
    const dispatchCounts: DispatchBucket = {
      NO_DISPATCH: 0,
      PENDING: 0,
      SUBMITTED: 0,
      ACCEPTED: 0,
      REJECTED: 0,
      ERROR: 0,
      NOT_CONFIGURED: 0,
    };

    for (const inv of invoices) {
      byStatus[inv.status].count += 1;
      byStatus[inv.status].amount = byStatus[inv.status].amount.plus(inv.grandTotal);
      if (inv.status === InvoiceStatus.ISSUED) {
        const latest = inv.dispatchEvents[0];
        if (!latest) dispatchCounts.NO_DISPATCH += 1;
        else dispatchCounts[latest.status] += 1;
      }
    }

    return {
      from: query.from,
      to: query.to,
      disclaimer:
        'Cuenta facturas por fecha de creación y muestra el último evento de envío DIAN por factura emitida. Las facturas DRAFT y VOIDED nunca tienen envío efectivo.',
      byStatus: {
        DRAFT: { count: byStatus.DRAFT.count, amount: decStr(byStatus.DRAFT.amount) },
        ISSUED: { count: byStatus.ISSUED.count, amount: decStr(byStatus.ISSUED.amount) },
        VOIDED: { count: byStatus.VOIDED.count, amount: decStr(byStatus.VOIDED.amount) },
      },
      dispatch: dispatchCounts,
      totals: {
        invoiceCount: invoices.length,
      },
    };
  }

  /**
   * Stock crítico. Snapshot actual (sin rango): devuelve ítems activos con `trackStock=true`
   * cuyo `quantityOnHand ≤ threshold`. Threshold viene de `inventory.stock_critical_threshold`
   * (setting global, default 3) salvo que el caller lo sobreescriba con `?threshold=N`.
   */
  async stockCritical(query: StockCriticalQueryDto) {
    const threshold = await this.resolveStockCriticalThreshold(query.threshold);
    const thresholdDecimal = new Prisma.Decimal(threshold);

    const rows = await this.prisma.inventoryItem.findMany({
      where: {
        isActive: true,
        trackStock: true,
        quantityOnHand: { lte: thresholdDecimal },
      },
      orderBy: [{ quantityOnHand: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        sku: true,
        name: true,
        supplier: true,
        category: true,
        itemKind: true,
        quantityOnHand: true,
        averageCost: true,
        measurementUnit: { select: { slug: true, name: true } },
      },
    });

    return {
      source: typeof query.threshold === 'number' ? 'query' : 'setting',
      threshold,
      disclaimer:
        'Snapshot actual. Solo ítems activos con control de stock. El umbral viene del setting `inventory.stock_critical_threshold`; se puede sobreescribir con `?threshold=N` para simular otro escenario.',
      rows: rows.map((r) => ({
        inventoryItemId: r.id,
        sku: r.sku,
        name: r.name,
        supplier: r.supplier,
        category: r.category,
        itemKind: r.itemKind,
        quantityOnHand: r.quantityOnHand.toString(),
        averageCost: r.averageCost ? r.averageCost.toString() : null,
        measurementUnitSlug: r.measurementUnit?.slug ?? null,
        measurementUnitName: r.measurementUnit?.name ?? null,
      })),
      totals: { count: rows.length },
    };
  }

  private async resolveStockCriticalThreshold(override?: number): Promise<number> {
    if (typeof override === 'number' && Number.isFinite(override) && override >= 0) {
      return Math.floor(override);
    }
    const row = await this.prisma.workshopSetting.findUnique({
      where: { key: 'inventory.stock_critical_threshold' },
    });
    const raw = row?.value;
    if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) {
      return Math.floor(raw);
    }
    if (typeof raw === 'string') {
      const parsed = Number.parseInt(raw, 10);
      if (Number.isFinite(parsed) && parsed >= 0) return parsed;
    }
    return 3; // fallback defensivo: alineado con el default del seed
  }

  /**
   * Utilidad por técnico: agrupa la utilidad de OT entregadas (`DELIVERED` en rango) por
   * `assignedToId`. OT sin técnico asignado quedan en el bucket `null` con etiqueta
   * «Sin técnico». OT con `costUnknown=true` (líneas PART sin snapshot) no contribuyen
   * al agregado del técnico (se reportan aparte como `workOrdersUnknownCost`).
   */
  async profitabilityByTechnician(query: ProfitabilityByTechnicianQueryDto) {
    const { from, to } = parseReportRangeOrThrow(query.from, query.to);

    const orders = await this.prisma.workOrder.findMany({
      where: {
        status: WorkOrderStatus.DELIVERED,
        deliveredAt: { gte: from, lte: to, not: null },
      },
      orderBy: { deliveredAt: 'asc' },
      select: {
        id: true,
        assignedTo: { select: { id: true, fullName: true, email: true } },
        lines: { select: lineTotalsSelect },
      },
    });

    type Bucket = {
      technicianId: string | null;
      fullName: string | null;
      email: string | null;
      revenueTotal: Prisma.Decimal;
      costTotal: Prisma.Decimal;
      profitTotal: Prisma.Decimal;
      workOrdersCounted: number;
      workOrdersConsidered: number;
      workOrdersUnknownCost: number;
    };
    const byTech = new Map<string, Bucket>();

    for (const wo of orders) {
      const totals = computeBillingTotals(lineRowsToLinesForTotals(wo.lines as typeof wo.lines));
      const key = wo.assignedTo?.id ?? '__unassigned__';
      const bucket = byTech.get(key) ?? {
        technicianId: wo.assignedTo?.id ?? null,
        fullName: wo.assignedTo?.fullName ?? null,
        email: wo.assignedTo?.email ?? null,
        revenueTotal: new Prisma.Decimal(0),
        costTotal: new Prisma.Decimal(0),
        profitTotal: new Prisma.Decimal(0),
        workOrdersCounted: 0,
        workOrdersConsidered: 0,
        workOrdersUnknownCost: 0,
      };
      bucket.workOrdersConsidered += 1;
      if (totals.totalCost !== null && totals.totalProfit !== null) {
        bucket.revenueTotal = bucket.revenueTotal.plus(totals.grandTotal);
        bucket.costTotal = bucket.costTotal.plus(totals.totalCost);
        bucket.profitTotal = bucket.profitTotal.plus(totals.totalProfit);
        bucket.workOrdersCounted += 1;
      } else {
        bucket.workOrdersUnknownCost += 1;
      }
      byTech.set(key, bucket);
    }

    const rows = Array.from(byTech.values())
      .sort((a, b) => (a.profitTotal.gt(b.profitTotal) ? -1 : a.profitTotal.lt(b.profitTotal) ? 1 : 0))
      .map((b) => {
        const marginPct =
          b.workOrdersCounted > 0 && b.revenueTotal.gt(0)
            ? b.profitTotal.mul(100).div(b.revenueTotal).toDecimalPlaces(2).toString()
            : null;
        return {
          technicianId: b.technicianId,
          fullName: b.fullName,
          email: b.email,
          label: b.fullName ?? b.email ?? 'Sin técnico',
          workOrdersConsidered: b.workOrdersConsidered,
          workOrdersCounted: b.workOrdersCounted,
          workOrdersUnknownCost: b.workOrdersUnknownCost,
          revenueTotal: decStr(b.revenueTotal),
          costTotal: decStr(b.costTotal),
          profitTotal: decStr(b.profitTotal),
          marginPct,
        };
      });

    return {
      from: query.from,
      to: query.to,
      disclaimer:
        'OT DELIVERED agrupadas por `assignedTo`. OT sin técnico asignado van al bucket «Sin técnico». Las OT con `costUnknown` se cuentan en `workOrdersUnknownCost` pero no aportan a utilidad agregada.',
      rows,
      totals: {
        technicianCount: rows.length,
        workOrdersConsidered: orders.length,
      },
    };
  }

  /**
   * Utilidad por servicio del catálogo: agrupa líneas LABOR con `serviceId` provenientes
   * de OT entregadas y ventas confirmadas del rango, sumando ingreso (`lineTotal`),
   * costo (`costSnapshot`) y utilidad por servicio. Líneas LABOR sin `serviceId` van al
   * bucket especial etiquetado «Sin servicio del catálogo».
   *
   * Nota: las líneas LABOR normalmente no tienen `costSnapshot` (mano de obra no
   * consume inventario), por lo que la utilidad de servicio suele igualar al ingreso.
   * Se incluye la columna de costo por completitud (eventual `costSnapshot` manual).
   */
  async profitabilityByService(query: ProfitabilityByServiceQueryDto) {
    const { from, to } = parseReportRangeOrThrow(query.from, query.to);

    const [woLines, saleLines] = await Promise.all([
      this.prisma.workOrderLine.findMany({
        where: {
          lineType: 'LABOR',
          workOrder: {
            status: WorkOrderStatus.DELIVERED,
            deliveredAt: { gte: from, lte: to, not: null },
          },
        },
        select: {
          id: true,
          serviceId: true,
          quantity: true,
          unitPrice: true,
          discountAmount: true,
          costSnapshot: true,
          taxRateId: true,
          taxRatePercentSnapshot: true,
          taxRate: { select: { kind: true } },
          service: { select: { id: true, code: true, name: true } },
        },
      }),
      this.prisma.saleLine.findMany({
        where: {
          lineType: 'LABOR',
          sale: {
            status: SaleStatus.CONFIRMED,
            confirmedAt: { gte: from, lte: to, not: null },
          },
        },
        select: {
          id: true,
          serviceId: true,
          quantity: true,
          unitPrice: true,
          discountAmount: true,
          costSnapshot: true,
          taxRateId: true,
          taxRatePercentSnapshot: true,
          taxRate: { select: { kind: true } },
          service: { select: { id: true, code: true, name: true } },
        },
      }),
    ]);

    type Bucket = {
      serviceId: string | null;
      code: string | null;
      name: string;
      revenue: Prisma.Decimal;
      cost: Prisma.Decimal;
      profit: Prisma.Decimal;
      lineCount: number;
    };
    const byService = new Map<string, Bucket>();

    const accumulate = (
      line: {
        id: string;
        serviceId: string | null;
        quantity: Prisma.Decimal;
        unitPrice: Prisma.Decimal | null;
        discountAmount: Prisma.Decimal | null;
        costSnapshot: Prisma.Decimal | null;
        taxRateId: string | null;
        taxRatePercentSnapshot: Prisma.Decimal | null;
        taxRate: { kind: 'VAT' | 'INC' } | null;
        service: { id: string; code: string; name: string } | null;
      },
    ) => {
      const asLineForTotals: LineForTotals = {
        id: line.id,
        lineType: 'LABOR',
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        discountAmount: line.discountAmount,
        costSnapshot: line.costSnapshot,
        taxRateId: line.taxRateId,
        taxRatePercentSnapshot: line.taxRatePercentSnapshot,
        taxRate: line.taxRate,
      };
      const totals = computeBillingTotals([asLineForTotals]);
      const key = line.serviceId ?? '__no_service__';
      const bucket = byService.get(key) ?? {
        serviceId: line.serviceId ?? null,
        code: line.service?.code ?? null,
        name: line.service?.name ?? 'Sin servicio del catálogo',
        revenue: new Prisma.Decimal(0),
        cost: new Prisma.Decimal(0),
        profit: new Prisma.Decimal(0),
        lineCount: 0,
      };
      bucket.revenue = bucket.revenue.plus(totals.grandTotal);
      if (totals.totalCost !== null) bucket.cost = bucket.cost.plus(totals.totalCost);
      if (totals.totalProfit !== null) bucket.profit = bucket.profit.plus(totals.totalProfit);
      else bucket.profit = bucket.profit.plus(totals.grandTotal); // sin costSnapshot, utilidad = ingreso
      bucket.lineCount += 1;
      byService.set(key, bucket);
    };

    for (const l of woLines) accumulate(l);
    for (const l of saleLines) accumulate(l);

    const rows = Array.from(byService.values())
      .sort((a, b) => (a.revenue.gt(b.revenue) ? -1 : a.revenue.lt(b.revenue) ? 1 : 0))
      .map((b) => {
        const marginPct =
          b.revenue.gt(0)
            ? b.profit.mul(100).div(b.revenue).toDecimalPlaces(2).toString()
            : null;
        return {
          serviceId: b.serviceId,
          code: b.code,
          name: b.name,
          lineCount: b.lineCount,
          revenueTotal: decStr(b.revenue),
          costTotal: decStr(b.cost),
          profitTotal: decStr(b.profit),
          marginPct,
        };
      });

    return {
      from: query.from,
      to: query.to,
      disclaimer:
        'Líneas LABOR de OT DELIVERED y Ventas CONFIRMED en el rango, agrupadas por `serviceId`. Mano de obra sin costo suele rendir utilidad = ingreso; las que tienen `costSnapshot` manual lo reflejan.',
      rows,
      totals: {
        serviceCount: rows.length,
        lineCount: woLines.length + saleLines.length,
      },
    };
  }
}
