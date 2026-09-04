import { useMemo } from 'react'
import {
  parseWorkOrderListFilters,
  type WorkOrderListFilterParams,
} from '../services/workOrdersListPresentation'

/**
 * Parsea filtros de URL una sola vez por cambio de query (`searchParams.toString()`).
 * Evita reparsear en cada render cuando solo cambia otro estado de la página (modales, formularios).
 */
export function useWorkOrderListFilters(searchParams: URLSearchParams): WorkOrderListFilterParams {
  const qs = searchParams.toString()
  return useMemo(() => parseWorkOrderListFilters(new URLSearchParams(qs)), [qs])
}
