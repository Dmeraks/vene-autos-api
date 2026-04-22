import { stripPortalBase } from '../constants/portalPath'

const MODULE_PREFIXES: Array<{ prefix: string; modulePath: string }> = [
  { prefix: '/caja', modulePath: '/caja' },
  { prefix: '/ordenes', modulePath: '/ordenes' },
  { prefix: '/clientes', modulePath: '/clientes' },
  { prefix: '/vehiculos', modulePath: '/clientes' },
  { prefix: '/inventario', modulePath: '/inventario' },
  { prefix: '/aceite', modulePath: '/aceite' },
  { prefix: '/recepcion', modulePath: '/recepcion' },
  { prefix: '/informes', modulePath: '/informes' },
  { prefix: '/ventas', modulePath: '/ventas' },
  { prefix: '/facturacion', modulePath: '/facturacion' },
  { prefix: '/admin/usuarios', modulePath: '/admin/usuarios' },
  { prefix: '/admin/roles', modulePath: '/admin/roles' },
  { prefix: '/admin/nomina', modulePath: '/admin/nomina' },
  { prefix: '/admin/finanzas-taller', modulePath: '/admin/finanzas-taller' },
  { prefix: '/admin/credito-empleados', modulePath: '/admin/credito-empleados' },
  { prefix: '/admin/servicios', modulePath: '/admin/servicios' },
  { prefix: '/admin/impuestos', modulePath: '/admin/impuestos' },
  { prefix: '/admin/resoluciones-fiscales', modulePath: '/admin/resoluciones-fiscales' },
  { prefix: '/admin/auditoria', modulePath: '/admin/auditoria' },
  { prefix: '/admin/configuracion', modulePath: '/admin/configuracion' },
  { prefix: '/admin/vista-rol', modulePath: '/admin/vista-rol' },
]

function isSafeAppPath(fullPath: string): boolean {
  if (fullPath.includes('://')) return false
  const p = stripPortalBase(fullPath)
  if (!p.startsWith('/')) return false
  if (p.startsWith('//')) return false
  if (p === '/login' || p === '/consultar-ot') return false
  return true
}

/** Mapeo puro pathname → “módulo” recordable (sin I/O). */
export function normalizePathToModule(pathname: string): string | null {
  if (!isSafeAppPath(pathname)) return null
  const p = stripPortalBase(pathname)
  for (const item of MODULE_PREFIXES) {
    if (p === item.prefix || p.startsWith(`${item.prefix}/`)) {
      return item.modulePath
    }
  }
  return null
}
