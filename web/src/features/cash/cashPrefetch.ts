import type { QueryClient } from '@tanstack/react-query'
import { STALE_OPERATIONAL_MS, STALE_SEMI_STATIC_MS } from '../../constants/queryStaleTime'
import { queryKeys } from '../../lib/queryKeys'
import { fetchCashCategories, fetchCashCurrentSession } from './cashQueryFns'

/** Hover «Caja» antes de navegar — sesión actual (+ categorías para formularios). */
export function prefetchCashShellQueries(queryClient: QueryClient): void {
  void queryClient.prefetchQuery({
    queryKey: queryKeys.cash.currentSession(),
    queryFn: ({ signal }) => fetchCashCurrentSession(signal),
    staleTime: STALE_OPERATIONAL_MS,
  })
  void queryClient.prefetchQuery({
    queryKey: queryKeys.cash.categories(),
    queryFn: ({ signal }) => fetchCashCategories(signal),
    staleTime: STALE_SEMI_STATIC_MS,
  })
}
