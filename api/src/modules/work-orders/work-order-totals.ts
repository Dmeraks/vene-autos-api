/**
 * Fase 2 · Totales de OT.
 *
 * La lógica se promovió a `common/billing/billing-totals` para reutilizarla desde
 * el módulo de ventas (Fase 3). Este archivo mantiene los nombres históricos como
 * re-exports para no dispersar cambios en los consumidores de la OT.
 */
export {
  computeLineTotals,
  computeBillingTotals as computeWorkOrderTotals,
  serializeBillingTotals as serializeWorkOrderTotals,
  serializeLineTotals,
  type LineForTotals,
  type LineTotals,
  type BillingTotals as WorkOrderTotals,
} from '../../common/billing/billing-totals';
