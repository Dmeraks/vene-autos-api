/**
 * Motor de cálculo de totales fiscales (COP enteros).
 *
 * Usado por órdenes de trabajo (Fase 2) y ventas de mostrador / POS (Fase 3).
 * Es una función pura: no toca base de datos, solo aplica la política monetaria del
 * taller (IVA/INC opcionales, descuento por línea, snapshot del ratePercent congelado
 * al momento de guardar para que cambios futuros no alteren documentos emitidos).
 *
 * La matemática la documenta `computeLineTotals` / `computeBillingTotals`.
 */
import { Prisma, TaxRateKind, WorkOrderLineType } from '@prisma/client';
import { ceilWholeCop } from '../money/cop-money';

/**
 * Shape mínimo que necesita el calculador. Tanto `WorkOrderLine` como `SaleLine`
 * cumplen con esta forma después de adjuntar el `taxRate.kind` vía include.
 */
export type LineForTotals = {
  id: string;
  lineType: WorkOrderLineType;
  quantity: Prisma.Decimal;
  unitPrice: Prisma.Decimal | null;
  discountAmount: Prisma.Decimal | null;
  costSnapshot: Prisma.Decimal | null;
  taxRateId: string | null;
  taxRatePercentSnapshot: Prisma.Decimal | null;
  taxRate: { kind: TaxRateKind } | null;
};

export type LineTotals = {
  lineId: string;
  grossAmount: Prisma.Decimal;
  discountAmount: Prisma.Decimal;
  taxableBase: Prisma.Decimal;
  taxPercent: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  taxKind: TaxRateKind | null;
  lineTotal: Prisma.Decimal;
  lineCost: Prisma.Decimal | null;
  lineProfit: Prisma.Decimal | null;
};

export type BillingTotals = {
  lineCount: number;
  linesSubtotal: Prisma.Decimal;
  totalDiscount: Prisma.Decimal;
  taxableBase: Prisma.Decimal;
  totalTax: Prisma.Decimal;
  taxVatAmount: Prisma.Decimal;
  taxIncAmount: Prisma.Decimal;
  grandTotal: Prisma.Decimal;
  totalCost: Prisma.Decimal | null;
  totalProfit: Prisma.Decimal | null;
};

const ZERO = new Prisma.Decimal(0);
const HUNDRED = new Prisma.Decimal(100);

export function computeLineTotals(line: LineForTotals): LineTotals {
  const qty = line.quantity;
  const unitPrice = line.unitPrice ?? ZERO;
  const grossRaw = qty.mul(unitPrice);
  const grossAmount = ceilWholeCop(grossRaw);

  const rawDiscount = line.discountAmount ?? ZERO;
  const clampedDiscount = rawDiscount.gt(grossAmount) ? grossAmount : rawDiscount;
  const discountAmount = ceilWholeCop(clampedDiscount);

  const taxableBase = grossAmount.minus(discountAmount);

  const percent = line.taxRatePercentSnapshot ?? ZERO;
  const taxRaw = taxableBase.mul(percent).div(HUNDRED);
  const taxAmount = percent.isZero() || taxableBase.lte(0) ? ZERO : ceilWholeCop(taxRaw);
  const taxKind = line.taxRate?.kind ?? null;

  const lineTotal = taxableBase.plus(taxAmount);

  // Solo PART tiene costo material. LABOR = servicio puro, costo asumido 0 (honorario).
  // Si una PART vieja no tiene costSnapshot, `lineCost` queda null y la línea queda fuera
  // del cálculo de utilidad (preferimos ocultarla antes que mentirla).
  let lineCost: Prisma.Decimal | null = null;
  let lineProfit: Prisma.Decimal | null = null;
  if (line.lineType === WorkOrderLineType.LABOR) {
    lineCost = new Prisma.Decimal(0);
    lineProfit = taxableBase;
  } else if (line.lineType === WorkOrderLineType.PART && line.costSnapshot) {
    lineCost = ceilWholeCop(qty.mul(line.costSnapshot));
    lineProfit = taxableBase.minus(lineCost);
  }

  return {
    lineId: line.id,
    grossAmount,
    discountAmount,
    taxableBase,
    taxPercent: percent,
    taxAmount,
    taxKind,
    lineTotal,
    lineCost,
    lineProfit,
  };
}

export function computeBillingTotals(lines: LineForTotals[]): BillingTotals {
  let linesSubtotal = ZERO;
  let totalDiscount = ZERO;
  let taxableBase = ZERO;
  let taxVat = ZERO;
  let taxInc = ZERO;
  let totalCost = ZERO;
  let totalProfit = ZERO;
  let hasUnknownCost = false;

  for (const ln of lines) {
    const t = computeLineTotals(ln);
    linesSubtotal = linesSubtotal.plus(t.grossAmount);
    totalDiscount = totalDiscount.plus(t.discountAmount);
    taxableBase = taxableBase.plus(t.taxableBase);
    if (t.taxKind === TaxRateKind.INC) {
      taxInc = taxInc.plus(t.taxAmount);
    } else {
      taxVat = taxVat.plus(t.taxAmount);
    }
    if (t.lineCost !== null && t.lineProfit !== null) {
      totalCost = totalCost.plus(t.lineCost);
      totalProfit = totalProfit.plus(t.lineProfit);
    } else if (ln.lineType === WorkOrderLineType.PART) {
      hasUnknownCost = true;
    }
  }

  const totalTax = taxVat.plus(taxInc);
  const grandTotal = linesSubtotal.minus(totalDiscount).plus(totalTax);

  return {
    lineCount: lines.length,
    linesSubtotal,
    totalDiscount,
    taxableBase,
    totalTax,
    taxVatAmount: taxVat,
    taxIncAmount: taxInc,
    grandTotal,
    totalCost: hasUnknownCost ? null : totalCost,
    totalProfit: hasUnknownCost ? null : totalProfit,
  };
}

export function serializeBillingTotals(t: BillingTotals) {
  return {
    lineCount: t.lineCount,
    linesSubtotal: t.linesSubtotal.toString(),
    totalDiscount: t.totalDiscount.toString(),
    taxableBase: t.taxableBase.toString(),
    totalTax: t.totalTax.toString(),
    taxVatAmount: t.taxVatAmount.toString(),
    taxIncAmount: t.taxIncAmount.toString(),
    grandTotal: t.grandTotal.toString(),
    totalCost: t.totalCost ? t.totalCost.toString() : null,
    totalProfit: t.totalProfit ? t.totalProfit.toString() : null,
  };
}

export function serializeLineTotals(t: LineTotals) {
  return {
    lineId: t.lineId,
    grossAmount: t.grossAmount.toString(),
    discountAmount: t.discountAmount.toString(),
    taxableBase: t.taxableBase.toString(),
    taxPercent: t.taxPercent.toString(),
    taxAmount: t.taxAmount.toString(),
    taxKind: t.taxKind,
    lineTotal: t.lineTotal.toString(),
    lineCost: t.lineCost ? t.lineCost.toString() : null,
    lineProfit: t.lineProfit ? t.lineProfit.toString() : null,
  };
}
