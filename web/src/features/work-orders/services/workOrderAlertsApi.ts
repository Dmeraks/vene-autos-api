import { api } from '../../../api/client'
import type { WorkOrderListResponse, WorkOrderStatus } from '../../../api/types'

/**
 * Total de OT con un estado dado (usa el mismo endpoint que el listado; pageSize=1).
 */
export async function fetchWorkOrderStatusTotal(status: WorkOrderStatus): Promise<number> {
  const qs = new URLSearchParams({
    status,
    page: '1',
    pageSize: '1',
  })
  const data = await api<WorkOrderListResponse>(`/work-orders?${qs.toString()}`)
  return typeof data.total === 'number' ? data.total : 0
}
