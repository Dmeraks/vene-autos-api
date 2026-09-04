import { Matches } from 'class-validator';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Fase 8 · Utilidad por técnico.
 *
 * Agrupa las OT `DELIVERED` del rango por `assignedToId` y suma ingreso, costo y
 * utilidad. Las OT sin técnico asignado quedan en el cubo especial `null` para que
 * el admin pueda auditarlas (no se pierden). OT con `costUnknown` no aportan a los
 * totales agregados (mismo criterio que `workOrderProfitability`).
 */
export class ProfitabilityByTechnicianQueryDto {
  @Matches(DAY, { message: 'from debe ser YYYY-MM-DD' })
  from!: string;

  @Matches(DAY, { message: 'to debe ser YYYY-MM-DD' })
  to!: string;
}
