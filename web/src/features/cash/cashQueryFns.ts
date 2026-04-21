import { api } from '../../api/client'
import type { CashCategory, CurrentSession, SessionRow } from './types'

export async function fetchCashCurrentSession(signal?: AbortSignal): Promise<CurrentSession | null> {
  try {
    return await api<CurrentSession | null>('/cash/sessions/current', { signal })
  } catch {
    return null
  }
}

export async function fetchCashSessionsList(signal?: AbortSignal): Promise<SessionRow[]> {
  try {
    return await api<SessionRow[]>('/cash/sessions', { signal })
  } catch {
    return []
  }
}

export async function fetchCashCategories(signal?: AbortSignal): Promise<CashCategory[]> {
  try {
    return await api<CashCategory[]>('/cash/categories', { signal })
  } catch {
    return []
  }
}
