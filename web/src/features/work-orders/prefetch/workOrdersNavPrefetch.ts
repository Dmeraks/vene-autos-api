import type { QueryClient } from '@tanstack/react-query'
import { STALE_WORK_ORDER_DETAIL_MS, STALE_WORK_ORDERS_LIST_MS } from '../../../constants/queryStaleTime'
import { queryKeys } from '../../../lib/queryKeys'
import {
  parseWorkOrderListFilters,
  readStoredPageSize,
  workOrderListFetchFilterKey,
} from '../services/workOrdersListPresentation'
import { fetchWorkOrderDetailForQuery, fetchWorkOrdersList } from '../services/workOrdersListApi'

/** Hover en tarjeta / fila → detalle listo al navegar. */
export function prefetchWorkOrderDetail(queryClient: QueryClient, workOrderId: string): void {
  void queryClient.prefetchQuery({
    queryKey: queryKeys.workOrders.detail(workOrderId),
    queryFn: ({ signal }) => fetchWorkOrderDetailForQuery(workOrderId, signal),
    staleTime: STALE_WORK_ORDER_DETAIL_MS,
  })
}

/**
 * Hover en «Órdenes» en el shell: primera página sin filtros de URL (alineado al landing típico).
 */
export function prefetchDefaultWorkOrdersList(queryClient: QueryClient): void {
  const emptyFilters = parseWorkOrderListFilters(new URLSearchParams())
  const filterKey = workOrderListFetchFilterKey(emptyFilters)
  const pageSize = readStoredPageSize()
  void queryClient.prefetchQuery({
    queryKey: queryKeys.workOrders.list({ filterKey, page: 1, pageSize }),
    queryFn: ({ signal }) =>
      fetchWorkOrdersList(
        {
          page: 1,
          pageSize,
          status: emptyFilters.statusFilter || undefined,
          vehicleId: emptyFilters.vehicleIdFilter || undefined,
          customerId: emptyFilters.customerIdFilter || undefined,
          search: emptyFilters.textSearch || undefined,
        },
        signal,
      ),
    staleTime: STALE_WORK_ORDERS_LIST_MS,
  })
}
