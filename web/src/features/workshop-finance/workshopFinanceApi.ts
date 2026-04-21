import { api } from '../../api/client'
import type { WorkshopPayableRow, WorkshopReserveContrib, WorkshopReserveTotalRow } from './types'

export async function fetchWorkshopReserveTotals(): Promise<WorkshopReserveTotalRow[]> {
  return api<WorkshopReserveTotalRow[]>('/workshop-finance/reserve-totals')
}

export async function fetchWorkshopReserveContributions(take: number): Promise<WorkshopReserveContrib[]> {
  return api<WorkshopReserveContrib[]>(`/workshop-finance/reserve-contributions?take=${take}`)
}

export async function fetchWorkshopPayables(): Promise<WorkshopPayableRow[]> {
  return api<WorkshopPayableRow[]>('/workshop-finance/payables')
}

export async function createWorkshopReserveLine(body: { name: string; percent: number }): Promise<void> {
  await api('/workshop-finance/reserve-lines', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function patchWorkshopReserveLine(
  lineId: string,
  body: { isActive: boolean },
): Promise<void> {
  await api(`/workshop-finance/reserve-lines/${lineId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export async function createWorkshopPayable(body: {
  creditorName: string
  initialAmount: string
  description?: string
}): Promise<void> {
  await api('/workshop-finance/payables', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function createWorkshopPayablePayment(
  payableId: string,
  body: { amount: string; method: 'CASH' | 'TRANSFER' | 'OTHER'; note?: string },
): Promise<void> {
  await api(`/workshop-finance/payables/${payableId}/payments`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function deleteWorkshopPayable(payableId: string): Promise<void> {
  await api(`/workshop-finance/payables/${payableId}`, { method: 'DELETE' })
}
