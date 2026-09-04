/**
 * Panel transaccional bajo un único prefijo (producción: también en Vite `base`).
 * La landing pública y /consultar-ot viven en la raíz del dominio.
 */
export const PORTAL_BASE = '/portal-transaccional-interno'

/** Ruta completa dentro del portal, p. ej. portalPath('/caja') → /portal-transaccional-interno/caja */
export function portalPath(absolutePath: string): string {
  const p = absolutePath.startsWith('/') ? absolutePath : `/${absolutePath}`
  if (p === '/') return PORTAL_BASE
  return `${PORTAL_BASE}${p}`
}

/** Quitar el prefijo del portal para lógica de módulo (last visit, etc.). */
export function stripPortalBase(pathname: string): string {
  if (pathname === PORTAL_BASE) return '/'
  if (pathname.startsWith(`${PORTAL_BASE}/`)) {
    return `/${pathname.slice(PORTAL_BASE.length + 1)}`
  }
  return pathname
}
