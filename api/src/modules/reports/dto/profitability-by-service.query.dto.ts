import { Matches } from 'class-validator';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Fase 8 · Utilidad por servicio del catálogo.
 *
 * Agrupa las líneas LABOR con `serviceId` en OT entregadas (`DELIVERED`) y ventas
 * confirmadas (`CONFIRMED`) del rango, sumando ingreso y costo por servicio.
 * Las líneas LABOR sin `serviceId` (mano de obra libre) quedan en el cubo `null`
 * con la etiqueta «Sin servicio del catálogo».
 */
export class ProfitabilityByServiceQueryDto {
  @Matches(DAY, { message: 'from debe ser YYYY-MM-DD' })
  from!: string;

  @Matches(DAY, { message: 'to debe ser YYYY-MM-DD' })
  to!: string;
}
