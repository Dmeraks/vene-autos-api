import { useCallback, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, ApiError, openAuthenticatedHtml } from '../api/client'
import type { QuoteDetail, QuoteLineType, QuoteStatus, Service, TaxRate } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { canAddQuoteLines, canRemoveQuoteLines, canSeeQuotesUi } from '../auth/quoteRouteAccess'
import { portalPath } from '../constants/portalPath'
import { STALE_INVENTORY_CATALOG_MS, STALE_OPERATIONAL_MS, STALE_SEMI_STATIC_MS } from '../constants/queryStaleTime'
import { fetchInventoryItemsForQuery } from '../features/inventory/services/inventoryCatalogApi'
import { queryKeys } from '../lib/queryKeys'
import { normalizeListResponse } from '../utils/normalizeListResponse'
import {
  API_MONEY_DECIMAL_REGEX,
  formatCopFromString,
  normalizeMoneyDecimalStringForApi,
} from '../utils/copFormat'
import { PageHeader } from '../components/layout/PageHeader'

const STATUS_LABEL: Record<QuoteStatus, string> = {
  DRAFT: 'Borrador',
  SENT: 'Enviada',
  ACCEPTED: 'Aceptada',
  REJECTED: 'Rechazada',
  CANCELLED: 'Anulada',
}

/** Estados que el usuario puede elegir según el flujo (borrador → enviada → aceptada | anulada). */
function quoteWorkflowStatusChoices(current: QuoteStatus): QuoteStatus[] {
  switch (current) {
    case 'DRAFT':
      return ['DRAFT', 'SENT', 'CANCELLED']
    case 'SENT':
      return ['SENT', 'ACCEPTED', 'CANCELLED']
    default:
      return [current]
  }
}

const STATUS_UI_LOCKED = new Set<QuoteStatus>(['ACCEPTED', 'CANCELLED', 'REJECTED'])

/** Campos mínimos para pasar borrador → enviada (API valida igual). */
function validateDraftSendFields(d: {
  customerName: string
  customerPhone: string
  vehicleBrand: string
  vehicleModel: string
}): string | null {
  const missing: string[] = []
  if (!d.customerName.trim()) missing.push('nombre')
  if (!d.customerPhone.trim()) missing.push('teléfono')
  if (!d.vehicleBrand.trim()) missing.push('marca')
  if (!d.vehicleModel.trim()) missing.push('modelo')
  if (missing.length === 0) return null
  return `Para enviar completá: ${missing.join(', ')}.`
}

function buildHeaderPatchBody(d: {
  title: string
  customerName: string
  customerPhone: string
  customerEmail: string
  vehiclePlate: string
  vehicleBrand: string
  vehicleModel: string
}): Record<string, unknown> {
  return {
    title: d.title.trim(),
    customerName: d.customerName.trim() || null,
    customerPhone: d.customerPhone.trim() || null,
    customerEmail: d.customerEmail.trim() || null,
    vehiclePlate: d.vehiclePlate.trim() || null,
    vehicleBrand: d.vehicleBrand.trim() || null,
    vehicleModel: d.vehicleModel.trim() || null,
  }
}

const MSG_SAVED_TO_MASTER = 'Cliente y vehículo registrados en el maestro.'

export function QuoteDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { can } = useAuth()
  const queryClient = useQueryClient()

  const canFinancials = can('quotes:view_financials')
  const canEditHeader = can('quotes:update')
  const canBuildLines = canAddQuoteLines(can)
  const detailQuery = useQuery({
    queryKey: queryKeys.quotes.detail(id ?? ''),
    queryFn: ({ signal }) => api<QuoteDetail>(`/quotes/${id}`, { signal }),
    enabled: Boolean(id) && canSeeQuotesUi(can),
    staleTime: STALE_OPERATIONAL_MS,
  })

  const inventoryQuery = useQuery({
    queryKey: queryKeys.inventory.items(),
    queryFn: ({ signal }) => fetchInventoryItemsForQuery(signal),
    staleTime: STALE_INVENTORY_CATALOG_MS,
    gcTime: 20 * 60_000,
    enabled: Boolean(id) && canSeeQuotesUi(can) && (can('inventory_items:read') || canBuildLines),
  })

  const servicesQuery = useQuery({
    queryKey: ['services', 'active'],
    queryFn: ({ signal }) =>
      api<Service[] | { items: Service[] }>('/services?activeOnly=true', { signal }).then((r) =>
        normalizeListResponse<Service>(r),
      ),
    staleTime: STALE_SEMI_STATIC_MS,
    enabled: Boolean(id) && canSeeQuotesUi(can) && (can('services:read') || canBuildLines),
  })

  const taxRatesQuery = useQuery({
    queryKey: ['taxRates', 'active'],
    queryFn: ({ signal }) =>
      api<TaxRate[] | { items: TaxRate[] }>('/tax-rates?activeOnly=true', { signal }).then((r) =>
        normalizeListResponse<TaxRate>(r),
      ),
    staleTime: STALE_SEMI_STATIC_MS,
    enabled: Boolean(id) && canSeeQuotesUi(can) && (can('tax_rates:read') || canBuildLines),
  })

  const invalidateDetail = useCallback(() => {
    if (id) void queryClient.invalidateQueries({ queryKey: queryKeys.quotes.detail(id) })
    void queryClient.invalidateQueries({ queryKey: queryKeys.quotes.root })
  }, [id, queryClient])

  const patchQuote = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api<QuoteDetail>(`/quotes/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => {
      setHeaderMsg(null)
      invalidateDetail()
    },
    onError: (e) => {
      setHeaderMsg(e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'No se pudo guardar.')
    },
  })

  function saveHeader(e: React.FormEvent) {
    e.preventDefault()
    if (!headerEditable || !id) return
    setHeaderMsg(null)
    patchQuote.mutate(buildHeaderPatchBody(headerDraft))
  }

  const [lineType, setLineType] = useState<QuoteLineType>('PART')
  const [partMode, setPartMode] = useState<'catalog' | 'adhoc'>('catalog')
  const [inventoryItemId, setInventoryItemId] = useState('')
  const [adhocName, setAdhocName] = useState('')
  const [adhocRef, setAdhocRef] = useState('')
  const [adhocUnit, setAdhocUnit] = useState('unit')
  const [description, setDescription] = useState('')
  const [serviceId, setServiceId] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [unitPrice, setUnitPrice] = useState('')
  const [taxRateId, setTaxRateId] = useState('')
  const [lineMsg, setLineMsg] = useState<string | null>(null)
  const [headerMsg, setHeaderMsg] = useState<string | null>(null)
  const [headerDraft, setHeaderDraft] = useState({
    title: '',
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    vehiclePlate: '',
    vehicleBrand: '',
    vehicleModel: '',
  })

  const items = useMemo(
    () => (inventoryQuery.data ?? []).filter((i) => i.isActive),
    [inventoryQuery.data],
  )

  const detailData = detailQuery.data
  /** Detalle opcional hasta que cargue — no usar como si existiera garantizado antes de los guards. */
  const isDraft = detailData?.status === 'DRAFT'
  /** Solo en borrador se editan cabecera y líneas; enviada queda congelada hasta aceptar o anular. */
  const linesEditable = Boolean(isDraft)
  const headerEditable = Boolean(isDraft && canEditHeader)
  const statusUiLocked = Boolean(detailData && STATUS_UI_LOCKED.has(detailData.status))

  useEffect(() => {
    if (!detailData) return
    setHeaderDraft({
      title: detailData.title,
      customerName: detailData.customerName ?? '',
      customerPhone: detailData.customerPhone ?? '',
      customerEmail: detailData.customerEmail ?? '',
      vehiclePlate: detailData.vehiclePlate ?? '',
      vehicleBrand: detailData.vehicleBrand ?? '',
      vehicleModel: detailData.vehicleModel ?? '',
    })
    /** No borrar headerMsg aquí: borraba errores de PATCH visibles hasta el siguiente guardado. */
  }, [
    detailData?.id,
    detailData?.updatedAt,
    detailData?.title,
    detailData?.customerName,
    detailData?.customerPhone,
    detailData?.customerEmail,
    detailData?.vehiclePlate,
    detailData?.vehicleBrand,
    detailData?.vehicleModel,
  ])

  const addLine = useMutation({
    mutationFn: async () => {
      if (!id) throw new Error('missing id')
      setLineMsg(null)
      const qty = quantity.trim()
      if (!/^\d+(\.\d{1,4})?$/.test(qty) || Number(qty) <= 0) {
        throw new Error('Cantidad inválida')
      }
      const body: Record<string, unknown> = {
        lineType,
        quantity: qty,
      }
      if (canFinancials && unitPrice.trim()) {
        if (!API_MONEY_DECIMAL_REGEX.test(unitPrice.trim())) {
          throw new Error('Precio unitario inválido')
        }
        body.unitPrice = normalizeMoneyDecimalStringForApi(unitPrice.trim())
      }
      if (taxRateId) body.taxRateId = taxRateId

      if (lineType === 'PART') {
        if (partMode === 'catalog') {
          if (!inventoryItemId) throw new Error('Elegí un repuesto del inventario')
          body.inventoryItemId = inventoryItemId
        } else {
          if (!adhocName.trim()) throw new Error('Nombre del repuesto requerido')
          body.adHocPart = {
            name: adhocName.trim(),
            reference: adhocRef.trim() || undefined,
            measurementUnitSlug: adhocUnit.trim() || 'unit',
          }
        }
      } else {
        if (!description.trim() && !serviceId) {
          throw new Error('Descripción o servicio del catálogo')
        }
        if (description.trim()) body.description = description.trim()
        if (serviceId) body.serviceId = serviceId
      }

      return api(`/quotes/${id}/lines`, { method: 'POST', body: JSON.stringify(body) })
    },
    onSuccess: () => {
      invalidateDetail()
      setDescription('')
      setServiceId('')
      setUnitPrice('')
      setLineMsg(null)
    },
    onError: (e) => {
      setLineMsg(e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Error')
    },
  })

  const deleteLine = useMutation({
    mutationFn: (lineId: string) => api(`/quotes/${id}/lines/${lineId}`, { method: 'DELETE' }),
    onSuccess: () => invalidateDetail(),
  })

  const deleteQuoteMutation = useMutation({
    mutationFn: () => api(`/quotes/${id}`, { method: 'DELETE' }),
    onSuccess: () => navigate(portalPath('/cotizaciones')),
    onError: (e) => {
      setHeaderMsg(
        e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'No se pudo eliminar la cotización.',
      )
    },
  })

  const saveToMasterMutation = useMutation({
    mutationFn: () =>
      api<QuoteDetail>(`/quotes/${id}/save-to-master`, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    onSuccess: () => {
      invalidateDetail()
      setHeaderMsg(MSG_SAVED_TO_MASTER)
    },
    onError: (e) => {
      setHeaderMsg(e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'No se pudo guardar.')
    },
  })

  if (!canSeeQuotesUi(can)) {
    return (
      <div className="space-y-4">
        <PageHeader title="Cotización" />
        <p className="text-sm text-slate-600">Sin permiso para ver cotizaciones.</p>
      </div>
    )
  }

  if (!id?.trim()) {
    return (
      <div className="space-y-4">
        <PageHeader title="Cotización" />
        <p className="text-sm text-slate-600">Esta dirección no incluye el identificador de una cotización.</p>
        <Link to={portalPath('/cotizaciones')} className="text-sm text-brand-700 hover:underline">
          ← Volver al listado
        </Link>
      </div>
    )
  }

  if (detailQuery.isError && !detailData) {
    const loadErr =
      detailQuery.error instanceof ApiError
        ? detailQuery.error.message
        : detailQuery.error instanceof Error
          ? detailQuery.error.message
          : 'No se pudo cargar la cotización.'
    return (
      <div className="space-y-4">
        <PageHeader title="Cotización" />
        <p className="text-sm text-red-600 dark:text-red-400">{loadErr}</p>
        <Link to={portalPath('/cotizaciones')} className="text-sm text-brand-700 hover:underline">
          ← Volver al listado
        </Link>
      </div>
    )
  }

  if (!detailData) {
    return (
      <div className="space-y-4">
        <PageHeader title="Cotización" />
        <p className="text-sm text-slate-600">
          {detailQuery.isFetching ? 'Cargando…' : 'Obteniendo cotización…'}
        </p>
        <Link to={portalPath('/cotizaciones')} className="text-sm text-brand-700 hover:underline">
          ← Volver al listado
        </Link>
      </div>
    )
  }

  const q = detailData

  return (
    <div className="space-y-8">
      <PageHeader
        title={q.title}
        description={`${q.publicCode} · ${STATUS_LABEL[q.status]}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
              title="Abre una ventana lista para imprimir o guardar como PDF (documento no fiscal)."
              onClick={() => void openAuthenticatedHtml(`/quotes/${id}/receipt`, `Cotización ${q.publicCode}`)}
            >
              Imprimir / PDF
            </button>
            {canEditHeader &&
            q.status === 'ACCEPTED' &&
            !(q.vehicleId ?? '').trim() ? (
              <button
                type="button"
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                disabled={saveToMasterMutation.isPending}
                title="Crea cliente y vehículo en el maestro con los datos congelados de esta cotización."
                onClick={() => saveToMasterMutation.mutate()}
              >
                {saveToMasterMutation.isPending ? 'Guardando…' : 'Guardar como cliente'}
              </button>
            ) : null}
            {canEditHeader &&
            (q.status === 'DRAFT' || q.status === 'CANCELLED' || q.status === 'REJECTED') ? (
              <button
                type="button"
                className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60 dark:border-red-800 dark:bg-slate-800 dark:text-red-300 dark:hover:bg-red-950/40"
                disabled={deleteQuoteMutation.isPending}
                onClick={() => {
                  if (
                    window.confirm(
                      '¿Eliminar esta cotización del sistema? Esta acción no se puede deshacer.',
                    )
                  ) {
                    deleteQuoteMutation.mutate()
                  }
                }}
              >
                {deleteQuoteMutation.isPending ? 'Eliminando…' : 'Eliminar cotización'}
              </button>
            ) : null}
            <Link to={portalPath('/cotizaciones')} className="text-sm font-medium text-brand-700 hover:underline">
              ← Cotizaciones
            </Link>
          </div>
        }
      />

      <form
        className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900"
        onSubmit={saveHeader}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">Estado</label>
            {statusUiLocked ? (
              <div className="mt-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800/80">
                {STATUS_LABEL[q.status]}
              </div>
            ) : (
              <select
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
                value={q.status}
                disabled={!canEditHeader || patchQuote.isPending}
                onChange={(e) => {
                  const next = e.target.value as QuoteStatus
                  if (!canEditHeader || patchQuote.isPending) return
                  if (next === 'SENT' && q.status === 'DRAFT') {
                    const miss = validateDraftSendFields(headerDraft)
                    if (miss) {
                      setHeaderMsg(miss)
                      return
                    }
                    patchQuote.mutate({ ...buildHeaderPatchBody(headerDraft), status: 'SENT' })
                    return
                  }
                  patchQuote.mutate({ status: next })
                }}
              >
                {quoteWorkflowStatusChoices(q.status).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            )}
            {q.status === 'SENT' ? (
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Enviada: cliente, vehículo y líneas quedan congelados. Marcá aceptada o anulada.
              </p>
            ) : null}
          </div>
          <div>
            <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">Título</label>
            <input
              type="text"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
              value={headerDraft.title}
              disabled={!headerEditable || patchQuote.isPending}
              onChange={(e) => setHeaderDraft((d) => ({ ...d, title: e.target.value }))}
              maxLength={200}
              autoComplete="off"
            />
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <fieldset className="min-w-0 space-y-2" disabled={!headerEditable || patchQuote.isPending}>
            <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Cliente
            </legend>
            <label className="block text-xs text-slate-600 dark:text-slate-400">
              Nombre
              <input
                type="text"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
                value={headerDraft.customerName}
                onChange={(e) => setHeaderDraft((d) => ({ ...d, customerName: e.target.value }))}
                maxLength={200}
                autoComplete="name"
              />
            </label>
            <label className="block text-xs text-slate-600 dark:text-slate-400">
              Teléfono
              <input
                type="tel"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
                value={headerDraft.customerPhone}
                onChange={(e) => setHeaderDraft((d) => ({ ...d, customerPhone: e.target.value }))}
                maxLength={40}
                autoComplete="tel"
              />
            </label>
            <label className="block text-xs text-slate-600 dark:text-slate-400">
              Correo
              <input
                type="email"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
                value={headerDraft.customerEmail}
                onChange={(e) => setHeaderDraft((d) => ({ ...d, customerEmail: e.target.value }))}
                maxLength={120}
                autoComplete="email"
              />
            </label>
          </fieldset>

          <fieldset className="min-w-0 space-y-2" disabled={!headerEditable || patchQuote.isPending}>
            <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Vehículo
            </legend>
            <label className="block text-xs text-slate-600 dark:text-slate-400">
              Placa
              <input
                type="text"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
                value={headerDraft.vehiclePlate}
                onChange={(e) => setHeaderDraft((d) => ({ ...d, vehiclePlate: e.target.value }))}
                maxLength={80}
                autoComplete="off"
              />
            </label>
            <label className="block text-xs text-slate-600 dark:text-slate-400">
              Marca
              <input
                type="text"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
                value={headerDraft.vehicleBrand}
                onChange={(e) => setHeaderDraft((d) => ({ ...d, vehicleBrand: e.target.value }))}
                maxLength={80}
              />
            </label>
            <label className="block text-xs text-slate-600 dark:text-slate-400">
              Modelo
              <input
                type="text"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
                value={headerDraft.vehicleModel}
                onChange={(e) => setHeaderDraft((d) => ({ ...d, vehicleModel: e.target.value }))}
                maxLength={80}
              />
            </label>
          </fieldset>
        </div>

        {headerEditable ? (
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
              disabled={patchQuote.isPending}
            >
              {patchQuote.isPending ? 'Guardando…' : 'Guardar cliente y vehículo'}
            </button>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Solo editable en borrador. Al pasar a enviada los datos quedan fijos para el PDF.
            </span>
          </div>
        ) : (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Datos de cliente y vehículo bloqueados salvo en borrador.
          </p>
        )}
        {headerMsg ? (
          <p
            className={
              headerMsg === MSG_SAVED_TO_MASTER
                ? 'text-sm text-emerald-600 dark:text-emerald-400'
                : 'text-sm text-red-600 dark:text-red-400'
            }
          >
            {headerMsg}
          </p>
        ) : null}
      </form>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Líneas</h2>
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
          <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
            <thead className="bg-slate-50 dark:bg-slate-800/80">
              <tr>
                <th className="px-3 py-2 text-left">Tipo</th>
                <th className="px-3 py-2 text-left">Detalle</th>
                <th className="px-3 py-2 text-right">Cant.</th>
                <th className="px-3 py-2 text-right">Total línea</th>
                {linesEditable && canRemoveQuoteLines(can) ? <th className="px-3 py-2" /> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {(q.lines ?? []).map((ln) => (
                <tr key={ln.id}>
                  <td className="px-3 py-2">{ln.lineType === 'PART' ? 'Repuesto' : 'Mano de obra'}</td>
                  <td className="px-3 py-2 text-slate-800 dark:text-slate-100">
                    {ln.lineType === 'PART'
                      ? ln.inventoryItem
                        ? `${ln.inventoryItem.sku} · ${ln.inventoryItem.name}`
                        : (ln.description ?? '—')
                      : ln.service
                        ? ln.service.name
                        : (ln.description ?? '—')}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{ln.quantity}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {canFinancials && ln.totals
                      ? formatCopFromString(ln.totals.lineTotal)
                      : canFinancials
                        ? '—'
                        : '—'}
                  </td>
                  {linesEditable && canRemoveQuoteLines(can) ? (
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        className="text-xs text-red-600 hover:underline"
                        onClick={() => {
                          if (window.confirm('¿Eliminar esta línea?')) deleteLine.mutate(ln.id)
                        }}
                      >
                        Quitar
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {canFinancials && q.totals ? (
          <div className="flex justify-end text-sm">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-600 dark:bg-slate-800/80">
              <div className="flex justify-between gap-8">
                <span className="text-slate-600 dark:text-slate-400">Total</span>
                <span className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                  {formatCopFromString(q.totals.grandTotal)}
                </span>
              </div>
            </div>
          </div>
        ) : null}
      </section>

      {linesEditable && canBuildLines ? (
        <section className="space-y-3 rounded-xl border border-dashed border-slate-300 p-4 dark:border-slate-600">
          <h3 className="font-medium text-slate-900 dark:text-slate-100">Agregar línea</h3>
          <div className="flex flex-wrap gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={lineType === 'PART'}
                onChange={() => setLineType('PART')}
              />
              Repuesto
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={lineType === 'LABOR'}
                onChange={() => setLineType('LABOR')}
              />
              Mano de obra
            </label>
          </div>

          {lineType === 'PART' ? (
            <div className="grid gap-3 md:grid-cols-2">
              <div className="flex gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={partMode === 'catalog'}
                    onChange={() => setPartMode('catalog')}
                  />
                  Inventario
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={partMode === 'adhoc'}
                    onChange={() => setPartMode('adhoc')}
                  />
                  Nuevo (sin stock)
                </label>
              </div>
              {partMode === 'catalog' ? (
                <select
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
                  value={inventoryItemId}
                  onChange={(e) => setInventoryItemId(e.target.value)}
                >
                  <option value="">— Repuesto —</option>
                  {items.map((it) => (
                    <option key={it.id} value={it.id}>
                      {it.sku} · {it.name}
                    </option>
                  ))}
                </select>
              ) : (
                <>
                  <input
                    placeholder="Nombre del repuesto"
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
                    value={adhocName}
                    onChange={(e) => setAdhocName(e.target.value)}
                  />
                  <input
                    placeholder="Referencia (opcional)"
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
                    value={adhocRef}
                    onChange={(e) => setAdhocRef(e.target.value)}
                  />
                  <input
                    placeholder="Unidad (slug, ej. unit)"
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
                    value={adhocUnit}
                    onChange={(e) => setAdhocUnit(e.target.value)}
                  />
                </>
              )}
            </div>
          ) : (
            <div className="grid gap-2 md:grid-cols-2">
              <input
                placeholder="Descripción de mano de obra"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
              <select
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
                value={serviceId}
                onChange={(e) => setServiceId(e.target.value)}
              >
                <option value="">— Servicio catálogo (opcional) —</option>
                {(servicesQuery.data ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} · {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-3">
            <label className="block text-xs font-medium text-slate-500">
              Cantidad
              <input
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </label>
            {canFinancials ? (
              <label className="block text-xs font-medium text-slate-500">
                Precio unitario (COP)
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
                  value={unitPrice}
                  onChange={(e) => setUnitPrice(e.target.value)}
                />
              </label>
            ) : null}
            {can('tax_rates:read') || canBuildLines ? (
              <label className="block text-xs font-medium text-slate-500">
                Impuesto
                <select
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
                  value={taxRateId}
                  onChange={(e) => setTaxRateId(e.target.value)}
                >
                  <option value="">— Sin impuesto —</option>
                  {(taxRatesQuery.data ?? []).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.ratePercent}%)
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>

          {lineMsg ? <p className="text-sm text-red-600">{lineMsg}</p> : null}

          <button
            type="button"
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
            disabled={addLine.isPending}
            onClick={() => addLine.mutate()}
          >
            {addLine.isPending ? 'Guardando…' : 'Agregar línea'}
          </button>
        </section>
      ) : null}
    </div>
  )
}
