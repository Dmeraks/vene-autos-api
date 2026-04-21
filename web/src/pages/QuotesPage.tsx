import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { api, ApiError } from '../api/client'
import type { QuoteDetail, QuoteListResponse, QuoteSummary } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { canSeeQuotesUi } from '../auth/quoteRouteAccess'
import { portalPath } from '../constants/portalPath'
import { STALE_OPERATIONAL_MS } from '../constants/queryStaleTime'
import { queryKeys } from '../lib/queryKeys'
import { PageHeader } from '../components/layout/PageHeader'

const PAGE_SIZE = 25

const STATUS_LABEL: Record<QuoteSummary['status'], string> = {
  DRAFT: 'Borrador',
  SENT: 'Enviada',
  ACCEPTED: 'Aceptada',
  REJECTED: 'Rechazada',
  CANCELLED: 'Anulada',
}

export function QuotesPage() {
  const { can } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const canRead = canSeeQuotesUi(can)
  /** Alta: quien puede crear cotización o tiene visión global (dueño/admin con read_all tras seed). */
  const canCreate = can('quotes:create') || can('quotes:read_all')
  const [page, setPage] = useState(1)
  const [createErr, setCreateErr] = useState<string | null>(null)

  const listKey = useMemo(
    () => queryKeys.quotes.list({ filterKey: 'default', page, pageSize: PAGE_SIZE }),
    [page],
  )

  const listQuery = useQuery({
    queryKey: listKey,
    queryFn: ({ signal }) =>
      api<QuoteListResponse>(`/quotes?page=${page}&pageSize=${PAGE_SIZE}`, { signal }),
    staleTime: STALE_OPERATIONAL_MS,
    enabled: canRead,
  })

  const createMutation = useMutation({
    mutationFn: () =>
      api<QuoteDetail>('/quotes', {
        method: 'POST',
        body: JSON.stringify({ title: 'Nueva cotización' }),
      }),
    onMutate: () => {
      setCreateErr(null)
    },
    onSuccess: (row) => {
      if (!row?.id) {
        setCreateErr('El servidor no devolvió el id de la cotización. Revisá la consola del API.')
        return
      }
      void queryClient.invalidateQueries({ queryKey: queryKeys.quotes.root })
      navigate(portalPath(`/cotizaciones/${row.id}`))
    },
    onError: (e) => {
      const msg =
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : 'No se pudo crear la cotización.'
      setCreateErr(msg)
    },
  })

  if (!canRead) {
    return (
      <div className="space-y-4">
        <PageHeader title="Cotizaciones" />
        <p className="text-sm text-slate-600 dark:text-slate-400">No tenés permiso para ver cotizaciones.</p>
      </div>
    )
  }

  const items = listQuery.data?.items ?? []
  const total = listQuery.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cotizaciones"
        description="Presupuestos previos a la orden de trabajo. Los repuestos nuevos se dan de alta en inventario sin stock hasta la compra."
        actions={
          canCreate ? (
            <button
              type="button"
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
              disabled={createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending ? 'Creando…' : 'Nueva cotización'}
            </button>
          ) : null
        }
      />

      {createErr ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
          {createErr}
        </p>
      ) : null}

      {listQuery.isError ? (
        <p className="text-sm text-red-600 dark:text-red-400">
          No se pudo cargar el listado.
          {listQuery.error instanceof ApiError ? (
            <span className="mt-1 block font-normal opacity-90">{listQuery.error.message}</span>
          ) : listQuery.error instanceof Error ? (
            <span className="mt-1 block font-normal opacity-90">{listQuery.error.message}</span>
          ) : null}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
            <thead className="bg-slate-50 dark:bg-slate-800/80">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-slate-700 dark:text-slate-200">Código</th>
                <th className="px-4 py-3 text-left font-medium text-slate-700 dark:text-slate-200">Título</th>
                <th className="px-4 py-3 text-left font-medium text-slate-700 dark:text-slate-200">Estado</th>
                <th className="px-4 py-3 text-left font-medium text-slate-700 dark:text-slate-200">Cliente / Vehículo</th>
                <th className="px-4 py-3 text-left font-medium text-slate-700 dark:text-slate-200">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {listQuery.isLoading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    Cargando…
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">
                    No hay cotizaciones para mostrar.
                  </td>
                </tr>
              ) : (
                items.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50">
                      <td className="px-4 py-3">
                        <Link
                          to={portalPath(`/cotizaciones/${row.id}`)}
                          className="font-medium text-brand-700 hover:underline dark:text-brand-400"
                        >
                          {row.publicCode}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-slate-800 dark:text-slate-100">{row.title}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                          {STATUS_LABEL[row.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        {[row.customerName, row.vehiclePlate].filter(Boolean).join(' · ') || '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {new Date(row.createdAt).toLocaleString(undefined, {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 ? (
        <div className="flex items-center justify-between text-sm">
          <button
            type="button"
            className="rounded border border-slate-300 px-3 py-1 disabled:opacity-40 dark:border-slate-600"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Anterior
          </button>
          <span className="text-slate-600 dark:text-slate-400">
            Página {page} de {totalPages} ({total} cotizaciones)
          </span>
          <button
            type="button"
            className="rounded border border-slate-300 px-3 py-1 disabled:opacity-40 dark:border-slate-600"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Siguiente
          </button>
        </div>
      ) : null}
    </div>
  )
}
