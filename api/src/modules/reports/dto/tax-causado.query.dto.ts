import { Matches } from 'class-validator';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Fase 8 · IVA/INC causado.
 *
 * Suma `InvoiceLine.taxAmount` + `InvoiceLine.lineTotal` agrupado por `TaxRate`
 * considerando únicamente `Invoice.status=ISSUED` cuyo `issuedAt` cae en rango.
 * Las facturas VOIDED o DRAFT no causan impuesto.
 */
export class TaxCausadoQueryDto {
  @Matches(DAY, { message: 'from debe ser YYYY-MM-DD' })
  from!: string;

  @Matches(DAY, { message: 'to debe ser YYYY-MM-DD' })
  to!: string;
}
