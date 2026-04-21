import { api } from '../../api/client'
import type { CreateSalePayload, SaleListResponse, SaleOrigin, SaleStatus } from '../../api/types'

export type ListSalesParams = {
  status?: SaleStatus
  origin?: SaleOrigin
  page: number
  pageSize: number
}

/** GET /sales — mismos filtros que el listado actual. */
export async function listSales(params: ListSalesParams): Promise<SaleListResponse> {
  const qs = new URLSearchParams()
  if (params.status) qs.set('status', params.status)
  if (params.origin) qs.set('origin', params.origin)
  qs.set('page', String(params.page))
  qs.set('pageSize', String(params.pageSize))
  return api<SaleListResponse>(`/sales?${qs.toString()}`)
}

/** POST /sales — crea borrador de venta. */
export async function createSale(payload: CreateSalePayload): Promise<{ id: string }> {
  return api<{ id: string }>('/sales', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}
