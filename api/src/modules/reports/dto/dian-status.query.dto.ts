import { Matches } from 'class-validator';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Fase 8 · Estado DIAN de facturación electrónica.
 *
 * Resume:
 *   * Facturas por estado (`DRAFT` / `ISSUED` / `VOIDED`) creadas en el rango.
 *   * Último `InvoiceDispatchEvent` por factura emitida: cuántas están `ACCEPTED`,
 *     `REJECTED`, `PENDING`, `SUBMITTED`, `ERROR`, `NOT_CONFIGURED`.
 *
 * El objetivo es dar visibilidad de cuántos comprobantes quedaron pendientes de envío
 * a la DIAN o con rechazo sin atender.
 */
export class DianStatusQueryDto {
  @Matches(DAY, { message: 'from debe ser YYYY-MM-DD' })
  from!: string;

  @Matches(DAY, { message: 'to debe ser YYYY-MM-DD' })
  to!: string;
}
