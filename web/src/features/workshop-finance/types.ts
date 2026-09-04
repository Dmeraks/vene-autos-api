export type WorkshopReserveLine = {
  id: string
  name: string
  percent: string
  sortOrder: number
  isActive: boolean
}

export type WorkshopReserveTotalRow = {
  line: WorkshopReserveLine
  accumulatedCop: string
}

export type WorkshopReserveContrib = {
  id: string
  createdAt: string
  cashSessionId: string
  sessionClosedAt: string | null
  lineName: string
  percentApplied: string
  baseCashCounted: string
  contributionAmount: string
}

export type WorkshopPayableRow = {
  id: string
  creditorName: string
  description: string | null
  initialAmount: string
  balanceAmount: string
  status: 'OPEN' | 'SETTLED'
  createdAt: string
  payments: Array<{
    id: string
    amount: string
    method: 'CASH' | 'TRANSFER' | 'OTHER'
    createdAt: string
    note: string | null
  }>
}
