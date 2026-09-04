import { useQuery } from '@tanstack/react-query'
import { useCallback } from 'react'
import { STALE_WORK_ORDER_DETAIL_MS } from '../../../constants/queryStaleTime'
import { queryKeys } from '../../../lib/queryKeys'
import {
  fetchWorkOrderDetailForQuery,
  fetchWorkOrderPaymentsForQuery,
} from '../services/workOrdersListApi'

type Opts = {
  hideCashUi: boolean
  canReadPayments: boolean
}

/**
 * Detalle + cobros de OT con TanStack Query (caché al volver desde el listado o reabrir la misma orden).
 * El prefetch en filas (`prefetchWorkOrderDetail`) hidrata la misma `queryKey`.
 *
 * `refetchOnMount: 'always'`: con `staleTime` largo (3 min), sin esto al salir de la ruta y volver a la misma OT
 * React Query reutilizaba el snapshot y **no** disparaba refetch; el listado u otras pantallas pueden haber
 * invalidado solo la lista o el stock, dejando el blob de detalle (incl. `lines`) desalineado con el servidor.
 */
export function useWorkOrderDetailCache(id: string | undefined, opts: Opts) {
  const paymentsEnabled = Boolean(id) && !opts.hideCashUi && opts.canReadPayments

  const detailQuery = useQuery({
    queryKey: id ? queryKeys.workOrders.detail(id) : ['workOrders', 'detail', '__none'],
    queryFn: ({ signal }) => fetchWorkOrderDetailForQuery(id!, signal),
    enabled: Boolean(id),
    staleTime: STALE_WORK_ORDER_DETAIL_MS,
    gcTime: 20 * 60_000,
    refetchOnMount: 'always',
  })

  const paymentsQuery = useQuery({
    queryKey: id ? queryKeys.workOrders.payments(id) : ['workOrders', 'payments', '__none'],
    queryFn: ({ signal }) => fetchWorkOrderPaymentsForQuery(id!, signal),
    enabled: paymentsEnabled,
    staleTime: STALE_WORK_ORDER_DETAIL_MS,
    gcTime: 20 * 60_000,
    refetchOnMount: 'always',
  })

  const refetchBundle = useCallback(async () => {
    await detailQuery.refetch()
    if (paymentsEnabled) await paymentsQuery.refetch()
  }, [detailQuery, paymentsEnabled, paymentsQuery])

  return { detailQuery, paymentsQuery, refetchBundle }
}
