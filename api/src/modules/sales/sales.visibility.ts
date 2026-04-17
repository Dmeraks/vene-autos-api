import type { JwtUserPayload } from '../auth/types/jwt-user.payload';

/** Ver importes en la venta (precios de línea, impuestos, descuentos, totales y cobros). */
export const SALES_VIEW_FINANCIALS = 'sales:view_financials' as const;

/**
 * Quien puede ver montos en la venta y fijar precios de línea. En mostrador esto debería
 * ser el caso de uso normal (caja), pero dejamos el gate explícito para:
 *   - Alinear con la política de OT (no toda pantalla con `sales:read` debe ver importes).
 *   - Permitir roles de consulta sin revelar márgenes.
 * Adicionalmente `sales:record_payment` cuenta como “ver plata” (el cajero necesita el saldo).
 */
export function actorMayViewSaleFinancials(actor: JwtUserPayload): boolean {
  const p = actor.permissions;
  return (
    p.includes(SALES_VIEW_FINANCIALS) ||
    p.includes('sales:record_payment')
  );
}

/**
 * Costo y utilidad son sensibles: un cajero ve precios pero no márgenes.
 * Gateado por `reports:read` (semilla: administración / dueño).
 */
export function actorMayViewSaleCosts(actor: JwtUserPayload): boolean {
  return actor.permissions.includes('reports:read');
}

/** `sales:read_all` ve todas; sin el permiso solo se ven las creadas por el propio usuario. */
export function actorMaySeeAllSales(actor: JwtUserPayload): boolean {
  return actor.permissions.includes('sales:read_all');
}
