/**
 * Lecturas operativas (catálogo repuestos, servicios, impuestos) necesarias para armar
 * líneas de cotización cuando el rol no tiene el permiso de lectura explícito del catálogo.
 */
export const QUOTE_LINE_BUILD_PERMISSIONS = [
  'quote_lines:create',
  'quotes:update',
  'quotes:create',
  'quotes:read_all',
] as const;

/** PATCH `/quotes/:id/lines/:lineId` — mismo criterio operativo que crear líneas. */
export const QUOTE_LINE_PATCH_PERMISSIONS = [
  'quote_lines:update',
  'quotes:update',
  'quotes:create',
  'quotes:read_all',
] as const;

/** DELETE `/quotes/:id/lines/:lineId` */
export const QUOTE_LINE_DELETE_PERMISSIONS = [
  'quote_lines:delete',
  'quotes:update',
  'quotes:create',
  'quotes:read_all',
] as const;
