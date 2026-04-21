import type { WorkOrderListResponse, WorkOrderSummary } from '../../../api/types'

/** Solo lo que consume el listado — menos re-render si el API agrega campos meta. */
export type WorkOrderListSlice = {
  items: WorkOrderSummary[]
  total: number
}

export function selectWorkOrderListSlice(data: WorkOrderListResponse): WorkOrderListSlice {
  return { items: data.items, total: data.total }
}
