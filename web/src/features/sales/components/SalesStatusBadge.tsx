import type { SaleStatus } from '../../../api/types'
import { SALES_STATUS_LABEL } from '../salesLabels'

export function SalesStatusBadge({ status }: { status: SaleStatus }) {
  const tone =
    status === 'CONFIRMED'
      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
      : status === 'CANCELLED'
        ? 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200'
        : 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-200'
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>
      {SALES_STATUS_LABEL[status]}
    </span>
  )
}
