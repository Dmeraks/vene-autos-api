export type EmployeeCreditSummaryRow = {
  debtorUserId: string
  fullName: string
  lineCount: number
  totalAmount: string
}

export type EmployeeCreditDebtorCandidate = {
  id: string
  fullName: string
}

export type EmployeeCreditLineRow = {
  id: string
  description: string
  amount: string
  createdAt: string
  updatedAt: string
  createdBy: { id: string; fullName: string }
}

export type EmployeeCreditLinesResponse = {
  debtorUserId: string
  debtorFullName: string
  lines: EmployeeCreditLineRow[]
}
