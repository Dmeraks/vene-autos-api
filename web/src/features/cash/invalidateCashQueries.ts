import type { QueryClient } from '@tanstack/react-query'
import { queryKeys } from '../../lib/queryKeys'

/** Sesión actual, historial de sesiones y LED de caja abierta (open-status). */
export async function invalidateCashOperationalState(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.cash.currentSession() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.cash.sessionsList() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.cash.openStatus() }),
  ])
}

export function invalidateCashExpenseRequestLists(queryClient: QueryClient): Promise<unknown> {
  return queryClient.invalidateQueries({ queryKey: queryKeys.cash.expenseRequestsRoot() })
}

export function invalidateCashDelegates(queryClient: QueryClient): Promise<unknown> {
  return queryClient.invalidateQueries({ queryKey: queryKeys.cash.delegatesBundle() })
}
