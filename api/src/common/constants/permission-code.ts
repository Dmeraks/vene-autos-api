/**
 * Utilidades para el formato `recurso:acción` usado en JWT, decoradores y seeds.
 * Mantener un solo formato evita desalineación entre base de datos y guards.
 */
/** Compone el código canónico que viaja en el JWT y valida PermissionsGuard. */
export function permissionCode(resource: string, action: string): string {
  return `${resource}:${action}`;
}

/** Parseo estricto del código compuesto; falla si falta `:` o está mal formado. */
export function parsePermissionCode(code: string): { resource: string; action: string } {
  const idx = code.indexOf(':');
  if (idx <= 0 || idx === code.length - 1) {
    throw new Error(`Código de permiso inválido: ${code}`);
  }
  return { resource: code.slice(0, idx), action: code.slice(idx + 1) };
}
