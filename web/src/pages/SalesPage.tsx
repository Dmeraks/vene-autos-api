import { Link } from 'react-router-dom'
import type { SaleSummary } from '../api/types'
import { PageHeader } from '../components/layout/PageHeader'
import { portalPath } from '../constants/portalPath'
import { SalesCounterCreateModal } from '../features/sales/components/SalesCounterCreateModal'
import { SalesStatusBadge } from '../features/sales/components/SalesStatusBadge'
import { SALES_ORIGIN_LABEL } from '../features/sales/salesLabels'
import { useSalesPageModel } from '../features/sales/useSalesPageModel'

export function SalesPage() {
  const m = useSalesPageModel()

  return (
    <div className="space-y-5">
      <PageHeader
        title="Ventas / POS"
        description="Mostrador y ventas derivadas de órdenes entregadas."
        actions={
          m.canCreate ? (
            <button
              type="button"
              onClick={() => m.setCreateOpen(true)}
              className="inline-flex items-center rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
            >
              Nueva venta
            </button>
          ) : null
        }
      />

      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col text-xs font-medium text-slate-600 dark:text-slate-300">
            Estado
            <select
              value={m.status}
              onChange={(e) => m.setFilter('status', e.target.value)}
              className="mt-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
            >
              <option value="">Todos</option>
              <option value="DRAFT">Borrador</option>
              <option value="CONFIRMED">Confirmada</option>
              <option value="CANCELLED">Anulada</option>
            </select>
          </label>
          <label className="flex flex-col text-xs font-medium text-slate-600 dark:text-slate-300">
            Origen
            <select
              value={m.origin}
              onChange={(e) => m.setFilter('origin', e.target.value)}
              className="mt-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
            >
              <option value="">Todos</option>
              <option value="COUNTER">Mostrador</option>
              <option value="WORK_ORDER">Desde OT</option>
            </select>
          </label>
          {m.loading ? (
            <span className="text-xs text-slate-500 dark:text-slate-400">Cargando…</span>
          ) : null}
        </div>
      </section>

      {m.msg ? (
        <div className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-700 dark:bg-rose-900/30 dark:text-rose-200">
          {m.msg}
        </div>
      ) : null}

      <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800/80 dark:text-slate-400">
            <tr>
              <th className="px-3 py-2">Código</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2">Origen</th>
              <th className="px-3 py-2">Cliente</th>
              <th className="px-3 py-2">Líneas</th>
              <th className="px-3 py-2">Cobros</th>
              <th className="px-3 py-2">Creada</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {m.data?.items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                  Sin ventas con estos filtros.
                </td>
              </tr>
            ) : null}
            {(m.data?.items ?? []).map((s: SaleSummary) => (
              <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/60">
                <td className="px-3 py-2">
                  <Link
                    to={portalPath(`/ventas/${s.id}`)}
                    className="font-medium text-brand-700 hover:underline dark:text-brand-300"
                  >
                    {s.publicCode}
                  </Link>
                </td>
                <td className="px-3 py-2">
                  <SalesStatusBadge status={s.status} />
                </td>
                <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{SALES_ORIGIN_LABEL[s.origin]}</td>
                <td className="px-3 py-2">
                  {s.customer?.displayName ?? s.customerName ?? <span className="text-slate-400">—</span>}
                </td>
                <td className="px-3 py-2">{s._count?.lines ?? 0}</td>
                <td className="px-3 py-2">{s._count?.payments ?? 0}</td>
                <td className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
                  {new Date(s.createdAt).toLocaleString('es-CO')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {m.showPagination ? (
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500 dark:text-slate-400">
            Página {m.page} de {m.totalPages} · {m.data!.total} ventas
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={m.pageDisabledPrev}
              onClick={m.goPrevPage}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800"
            >
              Anterior
            </button>
            <button
              type="button"
              disabled={m.pageDisabledNext}
              onClick={m.goNextPage}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800"
            >
              Siguiente
            </button>
          </div>
        </div>
      ) : null}

      <SalesCounterCreateModal
        open={m.createOpen}
        busy={m.createBusy}
        draft={m.createDraft}
        setDraft={m.setCreateDraft}
        msg={m.createMsg}
        onClose={() => m.setCreateOpen(false)}
        onSubmit={m.submitCreate}
      />
    </div>
  )
}
