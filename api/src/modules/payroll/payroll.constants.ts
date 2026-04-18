/**
 * Nómina técnica (Fase 9).
 *
 * Semana de trabajo: **lunes → sábado** (6 días). Pago los sábados.
 * Las OTs cuentan en la semana cuando `status = DELIVERED` y `deliveredAt ∈ [weekStart, weekEnd]`.
 * Si una OT se re-entrega después de pagada una corrida, la diferencia va a la semana del
 * nuevo `deliveredAt` (nunca se toca una corrida PAID / VOIDED).
 */

/** Porcentaje por defecto de la comisión de mano de obra. */
export const DEFAULT_LABOR_COMMISSION_PCT = 50;

/** Slug de la categoría de caja EXPENSE que materializa el pago de nómina. */
export const PAYROLL_CASH_CATEGORY_SLUG = 'nomina_mecanicos';

/** `referenceType` del movimiento de caja generado al pagar una corrida. */
export const PAYROLL_CASH_REFERENCE_TYPE = 'PayrollRun';

/** Roles con privilegios completos de nómina (configurar % y anular pagos). */
export const PAYROLL_OWNER_ROLE_SLUGS = ['administrador', 'dueno'] as const;

/** Slug del rol "Mecánico" (sembrado; migración renombró `tecnico` → `mecanico`). */
export const TECHNICIAN_ROLE_SLUG = 'mecanico';

/** Formato de fecha ISO (solo día): `YYYY-MM-DD`. */
export const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/** Regex de monto entero en pesos (igual convención que `cash-movements`). */
export const MONEY_DECIMAL_REGEX = /^-?\d+$/;
