import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api, ApiError } from '../api/client'
import type {
  CreateSalePayload,
  SaleListResponse,
  SaleOrigin,
  SaleStatus,
  SaleSummary,
} from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { portalPath } from '../constants/portalPath'
import { PageHeader } from '../components/layout/PageHeader'

const STATUS_LABEL: Record<SaleStatus, string> = {
  DRAFT: 'Borrador',
  CONFIRMED: 'Confirmada',
  CANCELLED: 'Anulada',
}
const ORIGIN_LABEL: Record<SaleOrigin, string> = {
  COUNTER: 'Mostrador',
  WORK_ORDER: 'Desde OT',
}

function StatusBadge({ status }: { status: SaleStatus }) {
  const tone =
    status === 'CONFIRMED'
      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
      : status === 'CANCELLED'
        ? 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200'
        : 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-200'
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>
      {STATUS_LABEL[status]}
    </span>
  )
}

export function SalesPage() {
  const { can } = useAuth()
  const canCreate = can('sales:create')

  const [params, setParams] = useSearchParams()
  const status = (params.get('status') as SaleStatus | null) ?? ''
  const origin = (params.get('origin') as SaleOrigin | null) ?? ''
  const page = Math.max(1, Number(params.get('page') ?? '1'))
  const pageSize = 20

  const [data, setData] = useState<SaleListResponse | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const [createOpen, setCreateOpen] = useState(false)
  const [createBusy, setCreateBusy] = useState(false)
  const [createDraft, setCreateDraft] = useState<CreateSalePayload>({})
  const [createMsg, setCreateMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams()
      if (status) qs.set('status', status)
      if (origin) qs.set('origin', origin)
      qs.set('page', String(page))
      qs.set('pageSize', String(pageSize))
      const res = await api<SaleListResponse>(`/sales?${qs.toString()}`)
      setData(res)
      setMsg(null)
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : 'Error al cargar ventas')
    } finally {
      setLoading(false)
    }
  }, [status, origin, page])

  useEffect(() => {
    void load()
  }, [load])

  const totalPages = useMemo(() => {
    if (!data) return 1
    return Math.max(1, Math.ceil(data.total / data.pageSize))
  }, [data])

  const setFilter = (k: string, v: string) => {
    const next = new URLSearchParams(params)
    if (v) next.set(k, v)
    else next.delete(k)
    next.set('page', '1')
    setParams(next, { replace: true })
  }

  async function submitCreate(e: React.FormEvent) {
    e.preventDefault()
    if (createBusy) return
    setCreateBusy(true)
    setCreateMsg(null)
    try {
      const payload: CreateSalePayload = Object.fromEntries(
        Object.entries(createDraft).filter(([, v]) => typeof v === 'string' && v.trim() !== ''),
      )
      const res = await api<{ id: string }>('/sales', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      setCreateOpen(false)
      setCreateDraft({})
      window.location.href = portalPath(`/ventas/${res.id}`)
    } catch (err) {
      setCreateMsg(err instanceof ApiError ? err.message : 'No se pudo crear la venta')
    } finally {
      setCreateBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Ventas / POS"
        description="Mostrador y ventas derivadas de órdenes entregadas."
        actions={
          canCreate ? (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
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
              value={status}
              onChange={(e) => setFilter('status', e.target.value)}
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
              value={origin}
              onChange={(e) => setFilter('origin', e.target.value)}
              className="mt-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
            >
              <option value="">Todos</option>
              <option value="COUNTER">Mostrador</option>
              <option value="WORK_ORDER">Desde OT</option>
            </select>
          </label>
          {loading ? (
            <span className="text-xs text-slate-500 dark:text-slate-400">Cargando…</span>
          ) : null}
        </div>
      </section>

      {msg ? (
        <div className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-700 dark:bg-rose-900/30 dark:text-rose-200">
          {msg}
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
            {data?.items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                  Sin ventas con estos filtros.
                </td>
              </tr>
            ) : null}
            {(data?.items ?? []).map((s: SaleSummary) => (
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
                  <StatusBadge status={s.status} />
                </td>
                <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{ORIGIN_LABEL[s.origin]}</td>
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

      {data && data.total > pageSize ? (
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500 dark:text-slate-400">
            Página {page} de {totalPages} · {data.total} ventas
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => {
                const next = new URLSearchParams(params)
                next.set('page', String(page - 1))
                setParams(next, { replace: true })
              }}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800"
            >
              Anterior
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => {
                const next = new URLSearchParams(params)
                next.set('page', String(page + 1))
                setParams(next, { replace: true })
              }}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800"
            >
              Siguiente
            </button>
          </div>
        </div>
      ) : null}

      {createOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4"
          onClick={() => !createBusy && setCreateOpen(false)}
        >
          <form
            onSubmit={submitCreate}
            className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-1 text-lg font-semibold">Nueva venta de mostrador</h2>
            <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
              Se crea en borrador. Vas a poder agregar líneas y cobrar después de confirmarla.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex flex-col text-xs font-medium text-slate-600 dark:text-slate-300">
                Nombre del cliente
                <input
                  value={createDraft.customerName ?? ''}
                  onChange={(e) => setCreateDraft((d) => ({ ...d, customerName: e.target.value }))}
                  maxLength={200}
                  className="mt-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
                />
              </label>
              <label className="flex flex-col text-xs font-medium text-slate-600 dark:text-slate-300">
                Documento
                <input
                  value={createDraft.customerDocumentId ?? ''}
                  onChange={(e) =>
                    setCreateDraft((d) => ({ ...d, customerDocumentId: e.target.value }))
                  }
                  maxLength={40}
                  className="mt-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
                />
              </label>
              <label className="flex flex-col text-xs font-medium text-slate-600 dark:text-slate-300">
                Teléfono
                <input
                  value={createDraft.customerPhone ?? ''}
                  onChange={(e) => setCreateDraft((d) => ({ ...d, customerPhone: e.target.value }))}
                  maxLength={40}
                  className="mt-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
                />
              </label>
              <label className="flex flex-col text-xs font-medium text-slate-600 dark:text-slate-300">
                Correo
                <input
                  type="email"
                  value={createDraft.customerEmail ?? ''}
                  onChange={(e) => setCreateDraft((d) => ({ ...d, customerEmail: e.target.value }))}
                  maxLength={120}
                  className="mt-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
                />
              </label>
              <label className="sm:col-span-2 flex flex-col text-xs font-medium text-slate-600 dark:text-slate-300">
                Notas internas (opcional)
                <textarea
                  value={createDraft.internalNotes ?? ''}
                  onChange={(e) => setCreateDraft((d) => ({ ...d, internalNotes: e.target.value }))}
                  maxLength={2000}
                  rows={2}
                  className="mt-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
                />
              </label>
            </div>
            {createMsg ? (
              <div className="mt-3 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-700 dark:bg-rose-900/30 dark:text-rose-200">
                {createMsg}
              </div>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => !createBusy && setCreateOpen(false)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={createBusy}
                className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {createBusy ? 'Creando…' : 'Crear venta'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  )
}
