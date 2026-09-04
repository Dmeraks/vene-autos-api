import { IsIn, IsOptional, Matches } from 'class-validator';

/** Rango inclusive en calendario UTC `YYYY-MM-DD`. */
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export type RevenueUnifiedGranularity = 'day' | 'week' | 'fortnight' | 'month';

/**
 * Reporte de ingresos **unificado** (Fase 6): consolida en una sola línea temporal
 * los montos canónicos por OT entregada, Venta confirmada y Factura emitida,
 * deduplicando el camino `Factura → Sale/WO` para no inflar cifras.
 *
 * Regla de documento canónico por evento de ingreso:
 *  1. Si existe `Invoice` (no VOIDED) ligada a Sale o WO en la ventana → canónico = Invoice.
 *  2. Si no, y hay `Sale` CONFIRMED ligada a la OT → canónico = Sale.
 *  3. Si no, y la `WorkOrder` está DELIVERED → canónico = WorkOrder.
 */
export class RevenueUnifiedQueryDto {
  @Matches(DAY, { message: 'from debe ser YYYY-MM-DD' })
  from!: string;

  @Matches(DAY, { message: 'to debe ser YYYY-MM-DD' })
  to!: string;

  @IsOptional()
  @IsIn(['day', 'week', 'fortnight', 'month'])
  granularity?: RevenueUnifiedGranularity;
}
