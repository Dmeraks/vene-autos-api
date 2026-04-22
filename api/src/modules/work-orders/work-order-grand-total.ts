import { Prisma, TaxRateKind, WorkOrderLineType } from '@prisma/client';
import { ceilWholeCop } from '../../common/money/cop-money';
import { computeWorkOrderTotals, type LineForTotals } from './work-order-totals';

type WorkOrderLineDelegate = {
  findMany: (args: {
    where: { workOrderId: string };
    select: {
      id: true;
      lineType: true;
      quantity: true;
      unitPrice: true;
      discountAmount: true;
      costSnapshot: true;
      taxRateId: true;
      taxRatePercentSnapshot: true;
      taxRate: { select: { kind: true } };
    };
  }) => Promise<
    Array<{
      id: string;
      lineType: WorkOrderLineType;
      quantity: Prisma.Decimal;
      unitPrice: Prisma.Decimal | null;
      discountAmount: Prisma.Decimal | null;
      costSnapshot: Prisma.Decimal | null;
      taxRateId: string | null;
      taxRatePercentSnapshot: Prisma.Decimal | null;
      taxRate: { kind: TaxRateKind } | null;
    }>
  >;
};

const lineSelectForBillingTotals = {
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

function lineRowsToForTotals(
  lineRows: Awaited<ReturnType<WorkOrderLineDelegate['findMany']>>,
): LineForTotals[] {
  return lineRows.map((ln) => ({
    id: ln.id,
    lineType: ln.lineType,
    quantity: ln.quantity,
    unitPrice: ln.unitPrice,
    discountAmount: ln.discountAmount,
    costSnapshot: ln.costSnapshot,
    taxRateId: ln.taxRateId,
    taxRatePercentSnapshot: ln.taxRatePercentSnapshot,
    taxRate: ln.taxRate ? { kind: ln.taxRate.kind } : null,
  }));
}

/** Subtotal bruto y total a cobrar (COP enteros), alineado con el detalle de OT. */
export async function billingTotalsCeiledForWorkOrder(
  workOrderLine: WorkOrderLineDelegate,
  workOrderId: string,
): Promise<{ linesSubtotal: Prisma.Decimal; grandTotal: Prisma.Decimal }> {
  const lineRows = await workOrderLine.findMany({
    where: { workOrderId },
    select: lineSelectForBillingTotals,
  });
  if (lineRows.length === 0) {
    return { linesSubtotal: new Prisma.Decimal(0), grandTotal: new Prisma.Decimal(0) };
  }
  const totals = computeWorkOrderTotals(lineRowsToForTotals(lineRows));
  return {
    linesSubtotal: ceilWholeCop(totals.linesSubtotal),
    grandTotal: ceilWholeCop(totals.grandTotal),
  };
}

/**
 * Total a cobrar de la OT (líneas con descuentos e impuestos), redondeado a COP enteros.
 */
export async function grandTotalCeiledForWorkOrder(
  workOrderLine: WorkOrderLineDelegate,
  workOrderId: string,
): Promise<Prisma.Decimal> {
  const { grandTotal } = await billingTotalsCeiledForWorkOrder(workOrderLine, workOrderId);
  return grandTotal;
}
