import type { CashCategory, SessionRow } from '../types'

export function selectSessionsRecentFirst(rows: SessionRow[]): SessionRow[] {
  return [...rows].sort((a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime())
}

export function selectCashCategoriesSorted(cats: CashCategory[]): CashCategory[] {
  return [...cats].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  )
}
