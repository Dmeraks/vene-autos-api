import type { SessionMovementRow } from '../../components/CashSessionMovementsPanel'

export type CashTab =
  | 'sesion'
  | 'ingreso'
  | 'egreso'
  | 'delegados'
  | 'movimientos'
  | 'solicitudes'

export type CashCategory = { id: string; slug: string; name: string; direction: string }

export type SessionRow = {
  id: string
  status: string
  openingAmount: string
  openedAt: string
  closedAt: string | null
}

/** Resumen calculado en el API (apertura + ingresos − egresos de la sesión). */
export type BalanceSummary = {
  totalIncome: string
  totalExpense: string
  expectedBalance: string
  movementCount: number
}

/** Respuesta de `GET /cash/sessions/current` cuando hay sesión abierta. */
export type CurrentSession = SessionRow & {
  balanceSummary?: BalanceSummary
  openedBy?: { id: string; email: string; fullName: string }
  movements?: SessionMovementRow[]
}

export type ExpenseReq = {
  id: string
  status: string
  amount: string
  category: { slug: string; name: string }
  createdAt: string
  note: string | null
  requestedBy?: { id: string; email: string; fullName: string }
  isExpired?: boolean
  resultMovement?: { id: string; sessionId: string; amount: string; createdAt: string } | null
}

export type UserBrief = { id: string; email: string; fullName: string }

/** Borrador de ingreso/egreso aislado del estado de sesión en `CashPage`. */
export type CashMovementDraftValues = {
  movCat: string
  movAmt: string
  movTender: string
  movNote: string
  movAck: boolean
  movTwoCopies: boolean
}
