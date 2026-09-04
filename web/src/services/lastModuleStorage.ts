import { normalizePathToModule } from '../utils/lastModulePath'

const LAST_MODULE_STORAGE_KEY = 'vene:last-module-path'
const RESUME_LAST_MODULE_STORAGE_KEY = 'vene:resume-last-module-enabled'

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
