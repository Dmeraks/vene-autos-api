import { Matches } from 'class-validator';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Fase 8 · Ventas por medio de pago.
 *
 * Toma los `CashMovement.INCOME` del rango que están vinculados a una venta/OT/factura
 * (referenceType ∈ {work_order, sale, invoice}) y los agrupa por `CashMovementCategory.slug`.
 * Cada slug que arranca con `ingreso_` mapea a un medio de pago (efectivo, transferencia,
 * tarjeta, Nequi, Daviplata, otro).
 */
export class SalesByPaymentMethodQueryDto {
  @Matches(DAY, { message: 'from debe ser YYYY-MM-DD' })
  from!: string;

  @Matches(DAY, { message: 'to debe ser YYYY-MM-DD' })
  to!: string;
}
