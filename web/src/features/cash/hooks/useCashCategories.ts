import { useQuery } from '@tanstack/react-query'
import { STALE_SEMI_STATIC_MS } from '../../../constants/queryStaleTime'
import { queryKeys } from '../../../lib/queryKeys'
import { fetchCashCategories } from '../cashQueryFns'
import { selectCashCategoriesSorted } from '../selectors/cashSelectors'

export function useCashCategories(canReadSessions: boolean) {
  const q = useQuery({
    queryKey: queryKeys.cash.categories(),
    queryFn: ({ signal }) => fetchCashCategories(signal),
    select: selectCashCategoriesSorted,
    enabled: canReadSessions,
    staleTime: STALE_SEMI_STATIC_MS,
  })

  return q.data ?? []
}
