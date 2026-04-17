const LAST_MODULE_STORAGE_KEY = 'vene:last-module-path'
const RESUME_LAST_MODULE_STORAGE_KEY = 'vene:resume-last-module-enabled'

const MODULE_PREFIXES: Array<{ prefix: string; modulePath: string }> = [
  { prefix: '/caja', modulePath: '/caja' },
  { prefix: '/ordenes', modulePath: '/ordenes' },
  { prefix: '/clientes', modulePath: '/clientes' },
  { prefix: '/vehiculos', modulePath: '/clientes' },
  { prefix: '/inventario', modulePath: '/inventario' },
  { prefix: '/aceite', modulePath: '/aceite' },
  { prefix: '/recepcion', modulePath: '/recepcion' },
  { prefix: '/informes', modulePath: '/informes' },
  { prefix: '/admin/usuarios', modulePath: '/admin/usuarios' },
  { prefix: '/admin/roles', modulePath: '/admin/roles' },
  { prefix: '/admin/auditoria', modulePath: '/admin/auditoria' },
  { prefix: '/admin/configuracion', modulePath: '/admin/configuracion' },
  { prefix: '/admin/vista-rol', modulePath: '/admin/vista-rol' },
]

function isSafeAppPath(path: string): boolean {
  if (!path.startsWith('/')) return false
  if (path.startsWith('//')) return false
  if (path.includes('://')) return false
  if (path === '/login' || path === '/consultar-ot') return false
  return true
}

export function normalizePathToModule(pathname: string): string | null {
  if (!isSafeAppPath(pathname)) return null
  for (const item of MODULE_PREFIXES) {
    if (pathname === item.prefix || pathname.startsWith(`${item.prefix}/`)) {
      return item.modulePath
    }
  }
  return null
}

export function setStoredLastModulePath(pathname: string): void {
  try {
    if (!isResumeLastModuleEnabled()) return
    const normalized = normalizePathToModule(pathname)
    if (!normalized) return
    window.localStorage.setItem(LAST_MODULE_STORAGE_KEY, normalized)
  } catch {
    // ignore storage failures (private mode, blocked storage, etc.)
  }
}

export function getStoredLastModulePath(): string | null {
  try {
    if (!isResumeLastModuleEnabled()) return null
    const raw = window.localStorage.getItem(LAST_MODULE_STORAGE_KEY)
    if (!raw) return null
    return normalizePathToModule(raw)
  } catch {
    return null
  }
}

export function isResumeLastModuleEnabled(): boolean {
  try {
    const raw = window.localStorage.getItem(RESUME_LAST_MODULE_STORAGE_KEY)
    if (raw === null) return true
    return raw !== 'false'
  } catch {
    return true
  }
}

export function setResumeLastModuleEnabled(enabled: boolean): void {
  try {
    window.localStorage.setItem(RESUME_LAST_MODULE_STORAGE_KEY, enabled ? 'true' : 'false')
    if (!enabled) {
      window.localStorage.removeItem(LAST_MODULE_STORAGE_KEY)
    }
  } catch {
    // ignore storage failures
  }
}
