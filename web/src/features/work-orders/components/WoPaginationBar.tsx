import { memo } from 'react'
import { WO_PAGE_SIZE_OPTIONS } from '../services/workOrdersListPresentation'

export const WoPaginationBar = memo(function WoPaginationBar({
  page,
  pageSize,
  total,
  loading,
  isSaas,
  onPageChange,
  onPageSizeChange,
}: {
  page: number
  pageSize: number
  total: number
  loading: boolean
  isSaas?: boolean
  onPageChange: (next: number) => void
  onPageSizeChange: (next: (typeof WO_PAGE_SIZE_OPTIONS)[number]) => void
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)
  const wrapClass = isSaas
    ? 'flex flex-col gap-3 rounded-xl border border-slate-200/85 bg-[var(--va-surface-elevated)] px-3 py-2.5 text-sm shadow-sm dark:border-slate-700 dark:bg-slate-900/60 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between'
    : 'flex flex-col gap-3 rounded-xl border border-slate-200/90 bg-slate-50/80 px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900/50 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between'
  const inputClass = isSaas
    ? 'rounded-lg border border-slate-200/90 bg-white px-2 py-1.5 text-xs font-medium text-slate-800 shadow-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100'
    : 'rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100'
  const pagerBtnClass = isSaas
    ? 'rounded-lg border border-slate-200/90 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-40 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700'
    : 'rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700'

  return (
    <div className={wrapClass}>
      <p className="text-slate-600 dark:text-slate-300">
        {loading ? (
          <span className="text-slate-500">Cargando…</span>
        ) : (
          <>
            <span className="font-medium text-slate-800 dark:text-slate-200">{from}</span>
            {'–'}
            <span className="font-medium text-slate-800 dark:text-slate-200">{to}</span>
            {' de '}
            <span className="font-medium text-slate-800 dark:text-slate-200">{total}</span>
            {total > 0 ? (
              <span className="text-slate-500 dark:text-slate-500">
                {' '}
                (pág. {page} de {totalPages})
              </span>
            ) : null}
          </>
        )}
      </p>
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
          <span>Por página</span>
          <select
            value={pageSize}
            disabled={loading}
            onChange={(e) =>
              onPageSizeChange(Number(e.target.value) as (typeof WO_PAGE_SIZE_OPTIONS)[number])
            }
            className={inputClass}
          >
            {WO_PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <div className="inline-flex items-center gap-1">
          <button
            type="button"
            disabled={loading || page <= 1}
            onClick={() => onPageChange(page - 1)}
            className={pagerBtnClass}
          >
            Anterior
          </button>
          <button
            type="button"
            disabled={loading || page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            className={pagerBtnClass}
          >
            Siguiente
          </button>
        </div>
      </div>
    </div>
  )
})
