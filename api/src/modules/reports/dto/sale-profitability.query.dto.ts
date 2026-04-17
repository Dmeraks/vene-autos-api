import { Matches } from 'class-validator';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Fase 8 · Rentabilidad por venta confirmada.
 *
 * Simétrico a `WorkOrderProfitabilityQueryDto`. Filtra `Sale.status=CONFIRMED` cuyo
 * `confirmedAt` cae en rango y calcula utilidad con el snapshot de costos
 * congelado en cada `SaleLine.costSnapshot` (margen histórico estable).
 */
export class SaleProfitabilityQueryDto {
  @Matches(DAY, { message: 'from debe ser YYYY-MM-DD' })
  from!: string;

  @Matches(DAY, { message: 'to debe ser YYYY-MM-DD' })
  to!: string;
}
