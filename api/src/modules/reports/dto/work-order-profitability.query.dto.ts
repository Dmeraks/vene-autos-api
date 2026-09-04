import { Matches } from 'class-validator';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Rentabilidad por OT (Fase 6): filtra órdenes **DELIVERED** cuyo `deliveredAt`
 * cae dentro del rango y calcula utilidad sobre el snapshot de costos
 * congelado al crear cada línea (`costSnapshot`). Si alguna línea PART no tiene
 * `costSnapshot` (histórica), la OT se marca con `costUnknown=true` y no aporta
 * a los totales agregados para no mentir el margen.
 */
export class WorkOrderProfitabilityQueryDto {
  @Matches(DAY, { message: 'from debe ser YYYY-MM-DD' })
  from!: string;

  @Matches(DAY, { message: 'to debe ser YYYY-MM-DD' })
  to!: string;
}
