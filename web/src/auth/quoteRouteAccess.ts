/**
 * Permisos que habilitan ver rutas/UI de cotizaciones (menú panel, lista, detalle).
 * Mantener alineado con GET `/quotes` en API.
 */
export const QUOTE_ROUTE_ACCESS_PERMISSIONS = [
  'quotes:read',
  'quotes:read_all',
  'quotes:create',
  'quotes:update',
  'quotes:view_financials',
  'quote_lines:create',
  'quote_lines:update',
  'quote_lines:delete',
] as const

/** Alineado con `POST /quotes/:id/lines` (API: `QUOTE_LINE_BUILD_PERMISSIONS`). */
const QUOTE_LINE_ADD_PERMISSIONS = [
  'quote_lines:create',
  'quotes:update',
  'quotes:create',
  'quotes:read_all',
] as const

/** Alineado con `DELETE /quotes/:id/lines/:lineId`. */
const QUOTE_LINE_REMOVE_PERMISSIONS = [
  'quote_lines:delete',
  'quotes:update',
  'quotes:create',
  'quotes:read_all',
] as const

export function canSeeQuotesUi(can: (permission: string) => boolean): boolean {
  return QUOTE_ROUTE_ACCESS_PERMISSIONS.some((code) => can(code))
}

export function canAddQuoteLines(can: (permission: string) => boolean): boolean {
  return QUOTE_LINE_ADD_PERMISSIONS.some((code) => can(code))
}

export function canRemoveQuoteLines(can: (permission: string) => boolean): boolean {
  return QUOTE_LINE_REMOVE_PERMISSIONS.some((code) => can(code))
}
