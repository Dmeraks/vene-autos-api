import type { JwtUserPayload } from '../auth/types/jwt-user.payload';

/** Ver importes en OT (líneas, subtotales, cobros, tope); cajero/admin/dueño. No técnico. */
export const WORK_ORDERS_VIEW_FINANCIALS = 'work_orders:view_financials' as const;

/** Legado: antes existía solo este permiso para precios en líneas; sigue contando como “ver plata” en OT. */
export const WORK_ORDER_LINES_SET_UNIT_PRICE = 'work_order_lines:set_unit_price' as const;

/**
 * Quien puede ver montos en la OT y fijar precio en líneas.
 * - `view_financials`: permiso explícito (semilla nueva).
 * - `set_unit_price`: instalaciones que aún no corrieron seed con `view_financials`.
 * - `record_payment`: cajero debe ver saldo para cobrar desde la OT (el técnico en semilla no lo tiene).
 */
export function actorMayViewWorkOrderFinancials(actor: JwtUserPayload): boolean {
  const p = actor.permissions;
  return (
    p.includes(WORK_ORDERS_VIEW_FINANCIALS) ||
    p.includes(WORK_ORDER_LINES_SET_UNIT_PRICE) ||
    p.includes('work_orders:record_payment')
  );
}

/**
 * Costo y utilidad son sensibles: un cajero ve precios pero no márgenes.
 * Se gatean por `reports:read` (semilla: administración / dueño).
 */
export function actorMayViewWorkOrderCosts(actor: JwtUserPayload): boolean {
  return actor.permissions.includes('reports:read');
}
