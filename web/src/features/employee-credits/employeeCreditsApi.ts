import { api } from '../../api/client'
import type {
  EmployeeCreditDebtorCandidate,
  EmployeeCreditLinesResponse,
  EmployeeCreditSummaryRow,
} from './types'

export function fetchEmployeeCreditSummary() {
  return api<EmployeeCreditSummaryRow[]>('/employee-credits/summary')
}

export function fetchEmployeeCreditDebtorCandidates() {
  return api<EmployeeCreditDebtorCandidate[]>('/employee-credits/debtor-candidates')
}

export function fetchEmployeeCreditLines(debtorUserId: string) {
  return api<EmployeeCreditLinesResponse>(`/employee-credits/lines/${encodeURIComponent(debtorUserId)}`)
}

export function createEmployeeCreditLine(body: { debtorUserId: string; description: string; amount: string }) {
  return api<{ id: string }>('/employee-credits/lines', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function updateEmployeeCreditLine(lineId: string, body: { description?: string; amount?: string }) {
  return api<{ id: string }>(`/employee-credits/lines/${encodeURIComponent(lineId)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export function voidEmployeeCreditLine(lineId: string) {
  return api<{ ok: true }>(`/employee-credits/lines/${encodeURIComponent(lineId)}`, { method: 'DELETE' })
}
