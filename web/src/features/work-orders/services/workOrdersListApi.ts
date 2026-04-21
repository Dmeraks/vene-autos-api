import { api } from '../../../api/client'
import type {
  CreateWorkOrderPayload,
  WorkOrderDetail,
  WorkOrderListResponse,
  WorkOrderStatus,
} from '../../../api/types'
import type { WorkOrdersVehicleHit, WorkOrdersWarrantyVehicleOption } from '../types'

export type WorkOrdersListQuery = {
  status?: WorkOrderStatus
  vehicleId?: string
  customerId?: string
  search?: string
  page: number
  pageSize: number
}

export async function fetchWorkOrdersList(
  q: WorkOrdersListQuery,
  signal?: AbortSignal,
): Promise<WorkOrderListResponse> {
  const qs = new URLSearchParams()
  if (q.status) qs.set('status', q.status)
  if (q.vehicleId) qs.set('vehicleId', q.vehicleId)
  if (q.customerId) qs.set('customerId', q.customerId)
  if (q.search) qs.set('search', q.search)
  qs.set('page', String(q.page))
  qs.set('pageSize', String(q.pageSize))
  return api<WorkOrderListResponse>(`/work-orders?${qs.toString()}`, { signal })
}

export async function searchVehiclesForWorkOrder(q: string): Promise<WorkOrdersVehicleHit[]> {
  return api<WorkOrdersVehicleHit[]>(`/vehicles/search?q=${encodeURIComponent(q)}`)
}

export async function fetchWorkOrderDetailForList(id: string): Promise<WorkOrderDetail> {
  return api<WorkOrderDetail>(`/work-orders/${id}?_=${Date.now()}`)
}

/** GET detalle sin bust de URL — para TanStack Query (caché + prefetch). */
export async function fetchWorkOrderDetailForQuery(id: string, signal?: AbortSignal): Promise<WorkOrderDetail> {
  return api<WorkOrderDetail>(`/work-orders/${id}`, { signal })
}

export async function fetchCustomerVehiclesForWorkOrderList(customerId: string): Promise<WorkOrdersWarrantyVehicleOption[]> {
  return api<WorkOrdersWarrantyVehicleOption[]>(`/customers/${customerId}/vehicles?_=${Date.now()}`)
}

export async function createWorkOrderFromList(
  body: CreateWorkOrderPayload,
): Promise<{ id: string; orderNumber?: number; publicCode?: string }> {
  return api<{ id: string; orderNumber?: number; publicCode?: string }>('/work-orders', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function cancelWorkOrderToTerminal(id: string): Promise<void> {
  await api(`/work-orders/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'CANCELLED' }),
  })
}
