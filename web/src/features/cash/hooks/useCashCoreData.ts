import { useCallback, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { STALE_OPERATIONAL_MS } from '../../../constants/queryStaleTime'
import { queryKeys } from '../../../lib/queryKeys'
import { fetchCashCurrentSession, fetchCashSessionsList } from '../cashQueryFns'
import { selectSessionsRecentFirst } from '../selectors/cashSelectors'
import type { CurrentSession, SessionRow } from '../types'

/**
 * Sesión actual + listado de sesiones (TanStack Query). `loadCore` invalida ambas queries.
 */
export function useCashCoreData(canReadSessions: boolean) {
  const queryClient = useQueryClient()

  const currentQuery = useQuery({
    queryKey: queryKeys.cash.currentSession(),
    queryFn: ({ signal }) => fetchCashCurrentSession(signal),
    enabled: canReadSessions,
    staleTime: STALE_OPERATIONAL_MS,
  })

  const sessionsQuery = useQuery({
    queryKey: queryKeys.cash.sessionsList(),
    queryFn: ({ signal }) => fetchCashSessionsList(signal),
    select: selectSessionsRecentFirst,
    enabled: canReadSessions,
    staleTime: STALE_OPERATIONAL_MS,
  })

  const current = useMemo((): CurrentSession | null | undefined => {
    if (!canReadSessions) return undefined
    if (currentQuery.isPending && currentQuery.data === undefined) return undefined
    return currentQuery.data ?? null
  }, [canReadSessions, currentQuery.isPending, currentQuery.data])

  const sessions = useMemo((): SessionRow[] => {
    if (!canReadSessions) return []
    return sessionsQuery.data ?? []
  }, [canReadSessions, sessionsQuery.data])

  const loadCore = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.cash.currentSession() }),
      queryClient.invalidateQueries({ queryKey: queryKeys.cash.sessionsList() }),
    ])
  }, [queryClient])

  return { current, sessions, loadCore }
}
