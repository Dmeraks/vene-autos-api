import { api } from '../api/client'

export type CashSessionOpenStatusDto = { open: boolean }

/**
 * GET /cash/sessions/open-status — único lugar para esta URL (cache/RQ después).
 */
export async function fetchCashSessionOpenStatus(): Promise<boolean> {
  const r = await api<CashSessionOpenStatusDto>('/cash/sessions/open-status')
  return Boolean(r.open)
}
