import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api, ApiError } from '../api/client'
import { emitWorkOrderChanged, WORK_ORDER_CHANGED_EVENT } from '../lib/workOrderEvents'
import type {
  CreateWorkOrderPayload,
  WorkOrderDetail,
  WorkOrderListResponse,
  WorkOrderSummary,
  WorkOrderStatus,
} from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { PageHeader } from '../components/layout/PageHeader'
import { PostCreateConsentModal } from '../components/work-order/PostCreateConsentModal'
import { usePanelTheme } from '../theme/PanelThemeProvider'
import {
  API_MONEY_DECIMAL_REGEX,
  formatMoneyInputDisplayFromNormalized,
  normalizeMoneyDecimalStringForApi,
} from '../utils/copFormat'

const STATUS: Record<
  WorkOrderStatus,
  { label: string; badge: string; cardBody: string; listRow: string }
> = {
  UNASSIGNED: {
    label: 'Sin asignar',
    badge:
      'bg-slate-200/90 text-slate-800 ring-1 ring-slate-300/70 dark:bg-slate-600 dark:text-slate-100 dark:ring-slate-500/80',
    cardBody:
      'border-l-slate-400 bg-gradient-to-br from-slate-50/90 to-white dark:border-l-slate-500 dark:from-slate-800/40 dark:to-slate-900',
    listRow: 'border-l-slate-400 bg-slate-50/35 dark:border-l-slate-500 dark:bg-slate-800/30',
  },
  RECEIVED: {
    label: 'Recibida',
    badge:
      'bg-sky-100 text-sky-950 ring-1 ring-sky-200/80 dark:bg-sky-900/50 dark:text-sky-100 dark:ring-sky-600/50',
    cardBody:
      'border-l-sky-500 bg-gradient-to-br from-sky-50/80 to-white dark:border-l-sky-400 dark:from-sky-950/35 dark:to-slate-900',
    listRow: 'border-l-sky-500 bg-sky-50/30 dark:border-l-sky-400 dark:bg-sky-950/20',
  },
  IN_WORKSHOP: {
    label: 'En taller',
    badge:
      'bg-indigo-100 text-indigo-950 ring-1 ring-indigo-200/80 dark:bg-indigo-900/55 dark:text-indigo-100 dark:ring-indigo-700/50',
    cardBody:
      'border-l-indigo-500 bg-gradient-to-br from-indigo-50/85 to-white dark:border-l-indigo-400 dark:from-indigo-950/35 dark:to-slate-900',
    listRow: 'border-l-indigo-500 bg-indigo-50/30 dark:border-l-indigo-400 dark:bg-indigo-950/22',
  },
  WAITING_PARTS: {
    label: 'Esperando repuestos',
    badge:
      'bg-amber-100 text-amber-950 ring-1 ring-amber-200/90 dark:bg-amber-900/50 dark:text-amber-50 dark:ring-amber-700/50',
    cardBody:
      'border-l-amber-500 bg-gradient-to-br from-amber-50/85 to-white dark:border-l-amber-400 dark:from-amber-950/30 dark:to-slate-900',
    listRow: 'border-l-amber-500 bg-amber-50/35 dark:border-l-amber-400 dark:bg-amber-950/18',
  },
  READY: {
    label: 'Lista',
    badge:
      'bg-emerald-100 text-emerald-950 ring-1 ring-emerald-200/80 dark:bg-emerald-900/55 dark:text-emerald-100 dark:ring-emerald-700/50',
    cardBody:
      'border-l-emerald-500 bg-gradient-to-br from-emerald-50/85 to-white dark:border-l-emerald-400 dark:from-emerald-950/32 dark:to-slate-900',
    listRow: 'border-l-emerald-500 bg-emerald-50/30 dark:border-l-emerald-400 dark:bg-emerald-950/20',
  },
  DELIVERED: {
    label: 'Entregada',
    badge:
      'bg-teal-100 text-teal-950 ring-1 ring-teal-200/80 dark:bg-teal-900/50 dark:text-teal-100 dark:ring-teal-700/50',
    cardBody:
      'border-l-teal-500 bg-gradient-to-br from-teal-50/80 to-white dark:border-l-teal-400 dark:from-teal-950/30 dark:to-slate-900',
    listRow: 'border-l-teal-500 bg-teal-50/28 dark:border-l-teal-400 dark:bg-teal-950/18',
  },
  CANCELLED: {
    label: 'Cancelada',
    badge:
      'bg-rose-100 text-rose-950 ring-1 ring-rose-200/80 dark:bg-rose-900/50 dark:text-rose-100 dark:ring-rose-700/50',
    cardBody:
      'border-l-rose-500 bg-gradient-to-br from-rose-50/85 to-white dark:border-l-rose-400 dark:from-rose-950/28 dark:to-slate-900',
    listRow: 'border-l-rose-500 bg-rose-50/30 dark:border-l-rose-400 dark:bg-rose-950/18',
  },
}

const STATUS_KEYS = Object.keys(STATUS) as WorkOrderStatus[]

const WO_LIST_VIEW_KEY = 'vene.workOrders.listView'
const WO_PAGE_SIZE_KEY = 'vene.workOrders.pageSize'
/** Tamaños de página ofrecidos en el listado (el API admite hasta 100). */
const WO_PAGE_SIZE_OPTIONS = [12, 24, 36, 50, 100] as const

type WoListView = 'grid' | 'list' | 'details'

function readStoredListView(): WoListView {
  try {
    const raw = localStorage.getItem(WO_LIST_VIEW_KEY)
    if (raw === 'grid' || raw === 'list' || raw === 'details') return raw
  } catch {
    /* ignore */
  }
  return 'grid'
}

function readStoredPageSize(): (typeof WO_PAGE_SIZE_OPTIONS)[number] {
  try {
    const n = Number(localStorage.getItem(WO_PAGE_SIZE_KEY))
    if (WO_PAGE_SIZE_OPTIONS.includes(n as (typeof WO_PAGE_SIZE_OPTIONS)[number])) {
      return n as (typeof WO_PAGE_SIZE_OPTIONS)[number]
    }
  } catch {
    /* ignore */
  }
  return 24
}

/** Insignia “Garantía” compacta (OT hija). */
const WO_WARRANTY_BADGE_CLASS =
  'shrink-0 rounded px-1 py-0 text-[9px] font-semibold uppercase tracking-wide bg-violet-100 text-violet-800 dark:bg-violet-900/60 dark:text-violet-100'

/** Remaches decorativos en esquinas (placa CO, vista cuadrícula): pequeños, negros, al borde. */
const WO_GRID_PLATE_RIVET_CLASS =
  'pointer-events-none absolute size-1 rounded-full bg-black shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]'

/**
 * Texto de patente al estilo visual colombiano (letras · números), sin ciudad ni leyendas.
 * Ej.: XTZ-308 → XTZ • 308; formato Mercosur ABC12D → ABC • 12D.
 */
function formatColombianPlateDisplay(raw: string): string {
  const s = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (!s) return raw.trim().toUpperCase()
  const mercosur = s.match(/^([A-Z]{3})(\d{2}[A-Z0-9]+)$/)
  if (mercosur) return `${mercosur[1]} • ${mercosur[2]}`
  const i = s.search(/\d/)
  if (i > 0) return `${s.slice(0, i)} • ${s.slice(i)}`
  return s
}

function formatWoDate(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: 'short',
      timeStyle: 'short',
    })
  } catch {
    return iso
  }
}

function parseStatusParam(raw: string | null): WorkOrderStatus | '' {
  if (!raw) return ''
  return STATUS_KEYS.includes(raw as WorkOrderStatus) ? (raw as WorkOrderStatus) : ''
}

type VehicleHit = {
  id: string
  plate: string
  brand: string | null
  model: string | null
  customer: { id: string; displayName: string; primaryPhone: string | null }
}

/** Vehículos del cliente (misma forma que GET `/customers/:id/vehicles`). */
type WarrantyVehicleOption = {
  id: string
  plate: string
  brand: string | null
  model: string | null
  isActive: boolean
}

function WoPaginationBar({
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
}

function ListViewToggle({
  value,
  onChange,
}: {
  value: WoListView
  onChange: (v: WoListView) => void
}) {
  const modes: { id: WoListView; label: string; title: string }[] = [
    { id: 'grid', label: 'Cuadrícula', title: 'Vista en cuadrícula' },
    { id: 'list', label: 'Lista', title: 'Vista compacta en lista' },
    { id: 'details', label: 'Detalles', title: 'Vista con más datos por orden' },
  ]

  return (
    <div
      className="flex shrink-0 flex-col gap-1 sm:items-end"
      role="radiogroup"
      aria-label="Vista del listado de órdenes"
    >
      <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-300">
        Vista
      </span>
      <div className="va-tabstrip va-tabstrip--inline va-tabstrip--compact" role="presentation">
        {modes.map((m) => {
          const on = value === m.id
          return (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={on}
              title={m.title}
              onClick={() => onChange(m.id)}
              className={`va-tab inline-flex min-w-[2.75rem] items-center justify-center sm:px-3 ${
                on ? 'va-tab-active' : 'va-tab-inactive'
              }`}
            >
              <span className="sr-only">{m.title}</span>
              <span aria-hidden className="hidden sm:inline">
                {m.label}
              </span>
              {m.id === 'grid' && (
                <svg
                  className="h-4 w-4 sm:ml-1 sm:hidden"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden
                >
                  <rect x="3" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" />
                  <rect x="14" y="14" width="7" height="7" rx="1" />
                </svg>
              )}
              {m.id === 'list' && (
                <svg
                  className="h-4 w-4 sm:ml-1 sm:hidden"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden
                >
                  <path d="M4 6h16M4 12h16M4 18h10" />
                </svg>
              )}
              {m.id === 'details' && (
                <svg
                  className="h-4 w-4 sm:ml-1 sm:hidden"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden
                >
                  <rect x="4" y="3" width="16" height="18" rx="2" />
                  <path d="M8 8h8M8 12h8M8 16h5" />
                </svg>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function LoupeButton({ title, onClick }: { title: string; onClick: () => void }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3" />
      </svg>
    </button>
  )
}

export function WorkOrdersPage() {
  const panelTheme = usePanelTheme()
  const isSaas = panelTheme === 'saas_light'
  const { can } = useAuth()
  const canViewWoFinancials = useMemo(
    () =>
      can('work_orders:view_financials') ||
      can('work_order_lines:set_unit_price') ||
      can('work_orders:record_payment'),
    [can],
  )
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const statusFilter = parseStatusParam(searchParams.get('status'))
  const vehicleIdFilter = (searchParams.get('vehicleId') ?? '').trim()
  const customerIdFilter = (searchParams.get('customerId') ?? '').trim()
  const vehiclePlateLabel = (searchParams.get('plate') ?? '').trim()
  const textSearch = (searchParams.get('search') ?? '').trim()

  const [rows, setRows] = useState<WorkOrderSummary[] | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<(typeof WO_PAGE_SIZE_OPTIONS)[number]>(() => readStoredPageSize())
  const [err, setErr] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  /** Tras POST crear: mostrar consentimiento antes de navegar al detalle */
  const [postCreateConsent, setPostCreateConsent] = useState<{
    id: string
    orderNumber: number | null
    publicCode: string | null
  } | null>(null)
  const [createMsg, setCreateMsg] = useState<string | null>(null)
  const [desc, setDesc] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [vehiclePlate, setVehiclePlate] = useState('')
  const [vehicleBrandCreate, setVehicleBrandCreate] = useState('')
  const [intakeKmCreate, setIntakeKmCreate] = useState('')
  const [inspectionOnlyCreate, setInspectionOnlyCreate] = useState(false)
  const [vehicleId, setVehicleId] = useState('')
  const [authorizedAmount, setAuthorizedAmount] = useState('')
  /** Crear OT de garantía vinculada a esta orden origen (id de OT entregada). */
  const [warrantyParentId, setWarrantyParentId] = useState<string | null>(null)
  const [warrantyParentOrderNumber, setWarrantyParentOrderNumber] = useState<number | null>(null)
  const [warrantyVehicleOptions, setWarrantyVehicleOptions] = useState<WarrantyVehicleOption[]>([])
  const [warrantyVehicleLoading, setWarrantyVehicleLoading] = useState(false)
  const [warrantyVehicleError, setWarrantyVehicleError] = useState<string | null>(null)
  /** Tras GET origen: la OT no tenía `vehicle` en maestro (solo entonces mostrar aviso de “sin vehículo”). */
  const [warrantyParentMissingVehicle, setWarrantyParentMissingVehicle] = useState(false)
  const [listView, setListView] = useState<WoListView>(() => readStoredListView())

  const [vehModalOpen, setVehModalOpen] = useState(false)
  const [vehQ, setVehQ] = useState('')
  const [vehLoading, setVehLoading] = useState(false)
  const [vehResults, setVehResults] = useState<VehicleHit[] | null>(null)
  const [vehErr, setVehErr] = useState<string | null>(null)
  const createBtnClass = 'va-btn-primary'
  const createMsgClass = isSaas
    ? 'flex flex-col gap-2 rounded-xl border border-slate-200/85 bg-[var(--va-surface-elevated)] px-4 py-3 text-sm text-slate-800 shadow-sm dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-100 sm:flex-row sm:items-center sm:justify-between'
    : 'flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-100 sm:flex-row sm:items-center sm:justify-between'
  const activeFiltersClass = isSaas
    ? 'flex flex-col gap-2 rounded-xl border border-brand-200/75 bg-[var(--va-accent-soft)]/65 px-4 py-3 text-sm text-slate-800 shadow-sm sm:flex-row sm:items-center sm:justify-between dark:border-brand-700/50 dark:bg-brand-900/45 dark:text-brand-50'
    : 'flex flex-col gap-2 rounded-2xl border border-brand-200/80 bg-brand-50/60 px-4 py-3 text-sm text-slate-800 sm:flex-row sm:items-center sm:justify-between dark:border-brand-700/50 dark:bg-brand-900/45 dark:text-brand-50'
  const clearFiltersBtnClass = isSaas
    ? 'inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-lg border border-slate-200/90 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 sm:min-h-0 sm:py-1.5 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
    : 'inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 sm:min-h-0 sm:py-1.5 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
  useEffect(() => {
    if (!createOpen) {
      setVehModalOpen(false)
    }
  }, [createOpen])

  useEffect(() => {
    try {
      localStorage.setItem(WO_LIST_VIEW_KEY, listView)
    } catch {
      /* ignore */
    }
  }, [listView])

  useEffect(() => {
    try {
      localStorage.setItem(WO_PAGE_SIZE_KEY, String(pageSize))
    } catch {
      /* ignore */
    }
  }, [pageSize])

  const listFilterRef = useRef<string | null>(null)
  const [listBusy, setListBusy] = useState(false)

  async function runVehicleSearch() {
    const q = vehQ.trim()
    if (q.length < 2) {
      setVehErr('Escribí al menos 2 caracteres')
      setVehResults(null)
      return
    }
    setVehErr(null)
    setVehLoading(true)
    try {
      const list = await api<VehicleHit[]>(`/vehicles/search?q=${encodeURIComponent(q)}`)
      setVehResults(list)
    } catch (e) {
      setVehResults(null)
      setVehErr(e instanceof Error ? e.message : 'Error al buscar')
    } finally {
      setVehLoading(false)
    }
  }

  const loadPage = useCallback(
    async (pageNum: number, signal?: AbortSignal) => {
      setErr(null)
      setListBusy(true)
      try {
        const qs = new URLSearchParams()
        if (statusFilter) qs.set('status', statusFilter)
        if (vehicleIdFilter) qs.set('vehicleId', vehicleIdFilter)
        if (customerIdFilter) qs.set('customerId', customerIdFilter)
        if (textSearch) qs.set('search', textSearch)
        qs.set('page', String(pageNum))
        qs.set('pageSize', String(pageSize))
        const path = `/work-orders?${qs.toString()}`
        const data = await api<WorkOrderListResponse>(path, { signal })
        if (signal?.aborted) return
        setRows(data.items)
        setTotal(data.total)
        const maxPage = Math.max(1, Math.ceil(data.total / pageSize) || 1)
        setPage((p) => (p > maxPage ? maxPage : p))
      } catch (e) {
        if (signal?.aborted) return
        const detail =
          e instanceof ApiError && e.message
            ? e.message
            : e instanceof Error
              ? e.message
              : 'Error desconocido'
        setErr(`No se pudieron cargar las órdenes: ${detail}`)
      } finally {
        setListBusy(false)
      }
    },
    [statusFilter, vehicleIdFilter, customerIdFilter, textSearch, pageSize],
  )

  useEffect(() => {
    const ac = new AbortController()
    const fk = `${statusFilter}|${vehicleIdFilter}|${customerIdFilter}|${textSearch}`
    const prevFk = listFilterRef.current
    const bumped = prevFk !== null && prevFk !== fk

    if (bumped && page !== 1) {
      listFilterRef.current = fk
      setPage(1)
      return () => ac.abort()
    }
    if (bumped || prevFk === null) {
      listFilterRef.current = fk
    }

    void loadPage(page, ac.signal)
    return () => ac.abort()
  }, [statusFilter, vehicleIdFilter, customerIdFilter, textSearch, page, pageSize, loadPage])

  /** Desde ficha de cliente: `?openCreate=1&vehicleId=…&plate=…` abre el alta con vehículo ya elegido. */
  useEffect(() => {
    const oc = searchParams.get('openCreate')?.trim()
    const vid = searchParams.get('vehicleId')?.trim()
    if (oc !== '1' || !vid || !can('work_orders:create')) return
    setCreateMsg(null)
    setWarrantyParentId(null)
    setWarrantyParentOrderNumber(null)
    setWarrantyVehicleOptions([])
    setWarrantyVehicleError(null)
    setWarrantyParentMissingVehicle(false)
    setWarrantyVehicleLoading(false)
    setVehicleId(vid)
    const pl = searchParams.get('plate')?.trim()
    setVehiclePlate(pl ?? '')
    setCustomerName('')
    setCustomerPhone('')
    setCreateOpen(true)
    const next = new URLSearchParams(searchParams)
    next.delete('openCreate')
    next.delete('vehicleId')
    next.delete('plate')
    setSearchParams(next, { replace: true })
  }, [searchParams, can, setSearchParams])

  /** Desde detalle de OT entregada: `?warrantyFrom=<id>` abre el alta con vínculo de garantía y vehículo por defecto. */
  useEffect(() => {
    const wf = searchParams.get('warrantyFrom')?.trim()
    if (!wf || !can('work_orders:create')) return

    /** Quitar `warrantyFrom` sin disparar cancelación del fetch: si lo hacemos antes, el efecto se re-ejecuta y el cleanup aborta la carga. */
    const clearWarrantyFromParam = () => {
      setSearchParams((prev) => {
        if (!prev.get('warrantyFrom')) return prev
        const n = new URLSearchParams(prev)
        n.delete('warrantyFrom')
        return n
      }, { replace: true })
    }

    setWarrantyParentId(wf)
    setWarrantyParentOrderNumber(null)
    setWarrantyVehicleOptions([])
    setWarrantyVehicleError(null)
    setWarrantyParentMissingVehicle(false)
    setCreateOpen(true)
    setDesc((prev) => (prev.trim() ? prev : 'Garantía / seguimiento vinculado. '))
    setVehicleId('')
    setVehiclePlate('')
    setCustomerName('')
    setCustomerPhone('')

    let cancelled = false

    if (!can('work_orders:read') && !can('work_orders:read_portal')) {
      clearWarrantyFromParam()
      return () => {
        cancelled = true
      }
    }

    setWarrantyVehicleLoading(true)
    ;(async () => {
      try {
        const parent = await api<WorkOrderDetail>(`/work-orders/${wf}?_=${Date.now()}`)
        if (cancelled) return
        setWarrantyParentOrderNumber(parent.orderNumber)
        const v = parent.vehicle
        if (!v?.id) {
          setWarrantyParentMissingVehicle(true)
          setWarrantyVehicleOptions([])
          return
        }
        setVehicleId(v.id)
        setVehiclePlate(v.plate)
        const cust = v.customer
        setCustomerName(cust?.displayName ?? parent.customerName ?? '')
        setCustomerPhone(cust?.primaryPhone ?? parent.customerPhone ?? '')

        if (!can('vehicles:read') || !cust?.id) {
          setWarrantyVehicleOptions([
            { id: v.id, plate: v.plate, brand: v.brand, model: v.model, isActive: true },
          ])
          return
        }
        const list = await api<WarrantyVehicleOption[]>(`/customers/${cust.id}/vehicles?_=${Date.now()}`)
        if (cancelled) return
        let opts = list.filter((x) => x.isActive)
        if (!opts.some((o) => o.id === v.id)) {
          opts = [{ id: v.id, plate: v.plate, brand: v.brand, model: v.model, isActive: true }, ...opts]
        }
        opts.sort((a, b) => a.plate.localeCompare(b.plate, undefined, { sensitivity: 'base' }))
        setWarrantyVehicleOptions(opts)
      } catch {
        if (!cancelled) {
          setWarrantyVehicleError('No se pudo cargar la orden origen ni los vehículos del cliente.')
        }
      } finally {
        if (!cancelled) {
          setWarrantyVehicleLoading(false)
          clearWarrantyFromParam()
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [searchParams, can, setSearchParams])

  useEffect(() => {
    const onWoChanged = () => {
      void loadPage(page)
    }
    window.addEventListener(WORK_ORDER_CHANGED_EVENT, onWoChanged)
    return () => window.removeEventListener(WORK_ORDER_CHANGED_EVENT, onWoChanged)
  }, [loadPage, page])

  function setStatus(next: WorkOrderStatus | '') {
    const nextParams = new URLSearchParams(searchParams)
    if (next) nextParams.set('status', next)
    else nextParams.delete('status')
    setSearchParams(nextParams, { replace: true })
  }

  function clearListFilters() {
    setSearchParams({}, { replace: true })
  }

  async function submitCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreateMsg(null)
    const vid = vehicleId.trim()
    if (!warrantyParentId && !vid) {
      setCreateMsg('Elegí un vehículo del maestro con la lupa (la orden debe quedar vinculada).')
      return
    }
    if (warrantyParentId && !vid) {
      setCreateMsg(
        'Falta el vehículo: si la orden origen no tiene uno en maestro, buscá con la lupa. Si podés leer la orden origen, debería cargarse solo.',
      )
      return
    }
    const body: CreateWorkOrderPayload = { description: desc.trim() }
    const aaNorm = normalizeMoneyDecimalStringForApi(authorizedAmount)
    if (authorizedAmount.trim() && (!aaNorm || !API_MONEY_DECIMAL_REGEX.test(aaNorm))) {
      setCreateMsg(
        'Tope de cobros: solo pesos enteros; miles con punto (ej. 2.550.356), o dejá vacío.',
      )
      return
    }
    if (vid) body.vehicleId = vid
    if (warrantyParentId) body.parentWorkOrderId = warrantyParentId
    const vb = vehicleBrandCreate.trim()
    if (vb) body.vehicleBrand = vb
    const ikm = intakeKmCreate.trim()
    if (ikm !== '') {
      const n = Number(ikm)
      if (!Number.isInteger(n) || n < 0 || n > 9_999_999) {
        setCreateMsg('Kilometraje: entero entre 0 y 9.999.999 o vacío.')
        return
      }
      body.intakeOdometerKm = n
    }
    if (inspectionOnlyCreate) body.inspectionOnly = true
    if (canViewWoFinancials && aaNorm) body.authorizedAmount = aaNorm
    try {
      const created = await api<{ id: string; orderNumber?: number; publicCode?: string }>('/work-orders', {
        method: 'POST',
        body: JSON.stringify(body),
      })
      setCreateOpen(false)
      setDesc('')
      setCustomerName('')
      setCustomerPhone('')
      setVehiclePlate('')
      setVehicleBrandCreate('')
      setIntakeKmCreate('')
      setInspectionOnlyCreate(false)
      setVehicleId('')
      setAuthorizedAmount('')
      setWarrantyParentId(null)
      setWarrantyParentOrderNumber(null)
      setWarrantyVehicleOptions([])
      setWarrantyVehicleError(null)
      setWarrantyParentMissingVehicle(false)
      setWarrantyVehicleLoading(false)
      setPostCreateConsent({
        id: created.id,
        orderNumber: typeof created.orderNumber === 'number' ? created.orderNumber : null,
        publicCode: typeof created.publicCode === 'string' ? created.publicCode : null,
      })
    } catch (e) {
      setCreateMsg(e instanceof Error ? e.message : 'Error al crear la orden')
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Órdenes de trabajo"
        description={
          can('work_orders:read_portal') && !can('work_orders:read')
            ? 'Consultá el estado de las órdenes asociadas a tu cuenta.'
            : 'Elegí una orden para ver detalle, líneas y totales.'
        }
        actions={
          can('work_orders:create') ? (
            <button
              type="button"
              onClick={() => {
                setCreateMsg(null)
                setWarrantyParentId(null)
                setWarrantyParentOrderNumber(null)
                setWarrantyVehicleOptions([])
                setWarrantyVehicleError(null)
                setWarrantyParentMissingVehicle(false)
                setWarrantyVehicleLoading(false)
                setCreateOpen(true)
              }}
              className={createBtnClass}
            >
              Nueva orden
            </button>
          ) : null
        }
      />

      {err && <p className="va-alert-error-lg">{err}</p>}

      {createMsg && !createOpen && (
        <div
          className={createMsgClass}
          role="status"
        >
          <p>{createMsg}</p>
          <button
            type="button"
            className="shrink-0 text-sm font-medium text-brand-700 underline hover:text-brand-800 dark:text-brand-300 dark:hover:text-brand-200"
            onClick={() => setCreateMsg(null)}
          >
            Cerrar aviso
          </button>
        </div>
      )}

      {(statusFilter || vehicleIdFilter || customerIdFilter || textSearch) && !err && (
        <div className={activeFiltersClass}>
          <p>
            <span className="font-medium">Filtros activos:</span>{' '}
            {textSearch && (
              <>
                búsqueda «<span className="font-medium">{textSearch}</span>»
                {statusFilter || vehicleIdFilter || customerIdFilter ? '; ' : '.'}
              </>
            )}
            {statusFilter && (
              <>
                estado «{STATUS[statusFilter].label}»
                {vehicleIdFilter || customerIdFilter ? '; ' : '.'}
              </>
            )}
            {customerIdFilter && (
              <>
                cliente maestro{' '}
                <span className="font-mono text-xs">{customerIdFilter}</span>
                {vehicleIdFilter ? '; ' : '.'}
              </>
            )}
            {vehicleIdFilter && (
              <>
                vehículo{' '}
                {vehiclePlateLabel ? (
                  <span className="font-mono">{vehiclePlateLabel}</span>
                ) : (
                  <span className="font-mono text-xs">{vehicleIdFilter}</span>
                )}
                .
              </>
            )}
          </p>
          <button
            type="button"
            onClick={() => clearListFilters()}
            className={clearFiltersBtnClass}
          >
            Quitar filtros
          </button>
        </div>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-300">
            Estado
          </span>
          <div
            className="va-tabstrip va-tabstrip--wrap va-tabstrip--compact max-w-full"
            role="tablist"
            aria-label="Filtrar listado por estado de orden"
          >
            <button
              type="button"
              role="tab"
              aria-selected={!statusFilter}
              onClick={() => setStatus('')}
              className={`va-tab max-sm:min-h-[44px] ${!statusFilter ? 'va-tab-active' : 'va-tab-inactive'}`}
            >
              Todas
            </button>
            {STATUS_KEYS.map((key) => {
              const st = STATUS[key]
              const on = statusFilter === key
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => setStatus(key)}
                  className={`va-tab max-sm:min-h-[44px] ${on ? 'va-tab-active' : 'va-tab-inactive'}`}
                >
                  {st.label}
                </button>
              )
            })}
          </div>
        </div>
        <ListViewToggle value={listView} onChange={setListView} />
      </div>

      {rows !== null && (
        <WoPaginationBar
          page={page}
          pageSize={pageSize}
          total={total}
          loading={listBusy}
          isSaas={isSaas}
          onPageChange={setPage}
          onPageSizeChange={(n) => {
            setPageSize(n)
            setPage(1)
          }}
        />
      )}

      {!rows && !err && (
        <p
          className={`py-8 text-center text-slate-500 dark:text-slate-300 ${isSaas ? 'va-saas-page-section' : 'va-card'}`}
        >
          Cargando…
        </p>
      )}

      {rows && rows.length === 0 && (
        <p
          className={`py-8 text-center text-slate-500 dark:text-slate-300 ${isSaas ? 'va-saas-page-section' : 'va-card'}`}
        >
          {statusFilter || vehicleIdFilter || customerIdFilter
            ? 'Ninguna orden coincide con los filtros.'
            : 'No hay órdenes recientes.'}
        </p>
      )}

      {createOpen && (
        <div className="va-modal-overlay" role="presentation">
          <div
            className="va-modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="wo-create-title"
            onClick={(ev) => ev.stopPropagation()}
          >
            <h2
              id="wo-create-title"
              className={
                isSaas ? 'va-section-title text-base' : 'text-lg font-semibold text-slate-900 dark:text-slate-50'
              }
            >
              {warrantyParentId ? 'Nueva orden de garantía' : 'Nueva orden de trabajo'}
            </h2>
            {warrantyParentId ? (
              <div className="mt-2 space-y-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-900 dark:border-violet-800 dark:bg-violet-950/50 dark:text-violet-100">
                <p>
                  Se vinculará como <strong>garantía o seguimiento</strong> a la orden origen{' '}
                  {warrantyParentOrderNumber != null ? (
                    <>
                      <strong>#{warrantyParentOrderNumber}</strong>{' '}
                    </>
                  ) : null}
                  (debe estar <strong>entregada</strong>). El vehículo por defecto es el de esa orden; si el titular
                  tiene más unidades en el maestro, podés cambiarla abajo.
                </p>
                {warrantyVehicleLoading ? (
                  <p className="text-violet-800/90 dark:text-violet-200/90">Cargando vehículo de la orden origen…</p>
                ) : null}
                {warrantyVehicleError ? (
                  <p className="font-medium text-red-700 dark:text-red-300">{warrantyVehicleError}</p>
                ) : null}
              </div>
            ) : (
              <p className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-200">
                La orden debe quedar <strong>vinculada a un vehículo del maestro</strong> (cliente y placa se toman de
                ahí). Usá la lupa para buscar por placa.
              </p>
            )}
            {createMsg && <p className="va-alert-error mt-2">{createMsg}</p>}
            <form className="mt-4 space-y-3" onSubmit={submitCreate}>
              <label className="block text-sm">
                <span className="va-label">Descripción del trabajo</span>
                <textarea
                  required
                  minLength={3}
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  rows={3}
                  className="va-field mt-1"
                />
              </label>
              <label className="block text-sm">
                <span className="va-label">
                  Vehículo{' '}
                  {!warrantyParentId ? <span className="text-red-600 dark:text-red-400">(obligatorio)</span> : null}
                </span>
                {warrantyParentId && warrantyVehicleOptions.length > 1 ? (
                  <>
                    <select
                      value={vehicleId}
                      onChange={(e) => {
                        const opt = warrantyVehicleOptions.find((o) => o.id === e.target.value)
                        if (!opt) return
                        setVehicleId(opt.id)
                        setVehiclePlate(opt.plate)
                      }}
                      className="va-field mt-1 w-full"
                    >
                      {warrantyVehicleOptions.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.plate}
                          {(o.brand || o.model) ? ` · ${[o.brand, o.model].filter(Boolean).join(' ')}` : ''}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-300">
                      Por defecto: el mismo vehículo de la orden en garantía. Cambiá solo si el seguimiento corresponde
                      a otra unidad del mismo titular.
                    </p>
                  </>
                ) : warrantyParentId &&
                  vehicleId &&
                  !warrantyVehicleLoading &&
                  warrantyVehicleOptions.length <= 1 ? (
                  <div className="mt-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-800/60 dark:text-slate-100">
                    <span className="font-mono font-medium">{vehiclePlate}</span>
                    {warrantyVehicleOptions[0] &&
                    (warrantyVehicleOptions[0].brand || warrantyVehicleOptions[0].model) ? (
                      <span className="ml-2 text-slate-600 dark:text-slate-300">
                        {[warrantyVehicleOptions[0].brand, warrantyVehicleOptions[0].model].filter(Boolean).join(' ')}
                      </span>
                    ) : null}
                  </div>
                ) : (
                  <div className="mt-1 flex gap-2">
                    <input
                      readOnly
                      value={vehiclePlate ? `${vehiclePlate} · ${vehicleId}` : vehicleId}
                      placeholder="Buscá con la lupa…"
                      className="va-field min-w-0 flex-1 font-mono text-sm"
                    />
                    {can('vehicles:read') && (
                      <LoupeButton
                        title="Buscar vehículo por placa (maestro)"
                        onClick={() => {
                          setVehQ(vehiclePlate.trim() || vehicleId.trim())
                          setVehModalOpen(true)
                        }}
                      />
                    )}
                  </div>
                )}
                {customerName.trim() || customerPhone.trim() ? (
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-300">
                    Titular: {customerName.trim()}
                    {customerPhone.trim() ? ` · ${customerPhone.trim()}` : ''}
                  </p>
                ) : null}
                {warrantyParentId && !warrantyVehicleLoading && !vehicleId && warrantyParentMissingVehicle ? (
                  <p className="mt-2 text-xs text-amber-800 dark:text-amber-200">
                    La orden origen no tiene vehículo en el maestro. Usá la lupa para vincular uno antes de crear la
                    garantía.
                  </p>
                ) : null}
                {warrantyParentId && !warrantyVehicleLoading && !vehicleId && !warrantyParentMissingVehicle && !can('work_orders:read') && !can('work_orders:read_portal') ? (
                  <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                    No tenés permiso para leer la orden origen: usá la lupa para elegir el vehículo del maestro.
                  </p>
                ) : null}
              </label>
              <label className="block text-sm">
                <span className="va-label">Marca (opcional)</span>
                <input
                  value={vehicleBrandCreate}
                  onChange={(e) => setVehicleBrandCreate(e.target.value)}
                  maxLength={80}
                  placeholder="Si no la mandás, se usa la del maestro al vincular"
                  className="va-field mt-1"
                />
              </label>
              <label className="block text-sm">
                <span className="va-label">Km al ingreso (opcional)</span>
                <input
                  inputMode="numeric"
                  value={intakeKmCreate}
                  onChange={(e) => setIntakeKmCreate(e.target.value.replace(/\D/g, ''))}
                  className="va-field mt-1"
                />
              </label>
              <label className="flex cursor-pointer items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={inspectionOnlyCreate}
                  onChange={(e) => setInspectionOnlyCreate(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-brand-600"
                />
                <span className="text-slate-700 dark:text-slate-200">
                  Solo revisión / diagnóstico (el cobro va como línea de mano de obra)
                </span>
              </label>
              {canViewWoFinancials ? (
                <label className="block text-sm">
                  <span className="va-label">Tope de cobros en caja (opcional)</span>
                  <input
                    inputMode="decimal"
                    autoComplete="off"
                    value={formatMoneyInputDisplayFromNormalized(
                      normalizeMoneyDecimalStringForApi(authorizedAmount),
                    )}
                    onChange={(e) => setAuthorizedAmount(normalizeMoneyDecimalStringForApi(e.target.value))}
                    placeholder="ej. 150000 o 150.000 (solo pesos enteros)"
                    className="va-field mt-1"
                  />
                </label>
              ) : null}
              <div className="flex gap-2 pt-2">
                <button type="submit" className="va-btn-primary">
                  Crear y abrir
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCreateOpen(false)
                    setWarrantyParentId(null)
                    setWarrantyParentOrderNumber(null)
                    setWarrantyVehicleOptions([])
                    setWarrantyVehicleError(null)
                    setWarrantyParentMissingVehicle(false)
                    setWarrantyVehicleLoading(false)
                  }}
                  className="va-btn-secondary"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {postCreateConsent && (
        <PostCreateConsentModal
          workOrderId={postCreateConsent.id}
          orderNumber={postCreateConsent.orderNumber}
          publicCode={postCreateConsent.publicCode}
          canRecordConsent={can('work_orders:update')}
          canCancelFreshOrder={can('work_orders:set_terminal_status')}
          onSigned={() => {
            const ctx = postCreateConsent
            setPostCreateConsent(null)
            emitWorkOrderChanged(ctx.id)
            navigate(`/ordenes/${ctx.id}`)
            void loadPage(page)
          }}
          onAbandon={async () => {
            const ctx = postCreateConsent
            if (!ctx) return
            setPostCreateConsent(null)
            if (can('work_orders:set_terminal_status')) {
              try {
                await api(`/work-orders/${ctx.id}`, {
                  method: 'PATCH',
                  body: JSON.stringify({ status: 'CANCELLED' }),
                })
                setCreateMsg('Orden cancelada: no se registró el consentimiento.')
              } catch (e) {
                setCreateMsg(e instanceof Error ? e.message : 'No se pudo cancelar la orden.')
              }
            } else {
              setCreateMsg(
                ctx.publicCode != null
                  ? `Orden ${ctx.publicCode} quedó creada sin firma: abrila desde el listado para firmar o pedí que la cancelen si no avanza.`
                  : ctx.orderNumber != null
                    ? `Orden #${ctx.orderNumber} quedó creada sin firma: abrila desde el listado para firmar o pedí que la cancelen si no avanza.`
                    : 'La orden quedó creada sin firma: podés abrirla desde el listado cuando corresponda.',
              )
            }
            emitWorkOrderChanged(ctx.id)
            void loadPage(page)
          }}
        />
      )}

      {vehModalOpen && (
        <div className="va-modal-overlay-nested" role="presentation">
          <div
            className="va-modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="wo-veh-search-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="wo-veh-search-title" className="text-base font-semibold text-slate-900 dark:text-slate-50">
              Buscar vehículo
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-300">
              Por placa. Al elegir, se completan patente, ID de vehículo y datos del titular en el formulario.
            </p>
            <div className="mt-3 flex gap-2">
              <input
                value={vehQ}
                onChange={(e) => setVehQ(e.target.value)}
                className="va-field min-w-0 flex-1 font-mono"
                placeholder="Ej. ABC12"
              />
              <button type="button" onClick={() => void runVehicleSearch()} className="va-btn-primary !min-h-0 px-3 py-2">
                Buscar
              </button>
            </div>
            {vehErr && <p className="mt-2 text-xs text-red-600 dark:text-red-300">{vehErr}</p>}
            {vehLoading && <p className="mt-2 text-xs text-slate-500">Buscando…</p>}
            {vehResults && vehResults.length === 0 && (
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-300">Sin resultados.</p>
            )}
            <ul className="mt-3 max-h-60 space-y-2 overflow-y-auto">
              {vehResults?.map((v) => (
                <li key={v.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setVehicleId(v.id)
                      setVehiclePlate(v.plate)
                      setCustomerName(v.customer.displayName)
                      setCustomerPhone(v.customer.primaryPhone ?? '')
                      setVehModalOpen(false)
                    }}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-left text-sm hover:border-brand-300 hover:bg-brand-50/50 dark:border-slate-600 dark:hover:border-brand-600 dark:hover:bg-slate-800"
                  >
                    <span className="font-mono font-medium text-slate-900 dark:text-slate-50">{v.plate}</span>
                    {(v.brand || v.model) && (
                      <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-300">
                        {[v.brand, v.model].filter(Boolean).join(' ')}
                      </span>
                    )}
                    <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-300">{v.customer.displayName}</span>
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="mt-4 w-full rounded-xl border border-slate-200 py-2 text-sm dark:border-slate-600"
              onClick={() => setVehModalOpen(false)}
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      <ul
        className={
          listView === 'grid'
            ? 'grid gap-2 grid-cols-1 items-stretch sm:grid-cols-2 lg:grid-cols-4'
            : listView === 'list'
              ? 'divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200/90 bg-white dark:divide-slate-700 dark:border-slate-700 dark:bg-slate-900'
              : 'space-y-2'
        }
      >
        {rows?.map((wo) => {
          const st = STATUS[wo.status]
          const warrantyBadge = wo.parentWorkOrder ? (
            <span className={WO_WARRANTY_BADGE_CLASS}>Garantía</span>
          ) : null

          if (listView === 'list') {
            return (
              <li key={wo.id}>
                <Link
                  to={`/ordenes/${wo.id}`}
                  className={`flex w-full items-center gap-2 border-l-4 px-3 py-2 text-left transition hover:bg-slate-50/90 dark:hover:bg-slate-800/70 ${st.listRow}`}
                >
                  <div className="flex w-[5.5rem] shrink-0 flex-col gap-0.5">
                    <span className="text-[11px] font-semibold leading-tight tracking-tight text-slate-800 dark:text-slate-100">
                      {wo.publicCode}
                    </span>
                    <span className="font-mono text-[10px] text-slate-400 dark:text-slate-500">#{wo.orderNumber}</span>
                    {warrantyBadge}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium leading-tight text-slate-900 dark:text-slate-50">
                      {wo.description}
                    </p>
                    <p className="truncate text-[11px] leading-tight text-slate-500 dark:text-slate-300">
                      {[wo.customerName, wo.vehiclePlate, wo.assignedTo?.fullName ? wo.assignedTo.fullName : null]
                        .filter(Boolean)
                        .join(' · ') || '—'}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${st.badge}`}>
                    {st.label}
                  </span>
                </Link>
              </li>
            )
          }

          if (listView === 'details') {
            return (
              <li key={wo.id}>
                <Link
                  to={`/ordenes/${wo.id}`}
                  className={`block rounded-xl border border-slate-200/90 border-l-4 p-3 shadow-sm transition hover:border-brand-200 hover:shadow-md dark:border-slate-700 dark:hover:border-brand-600 ${st.cardBody}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-1.5">
                    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                      <span className="text-xs font-semibold tracking-tight text-slate-800 dark:text-slate-100">
                        {wo.publicCode}
                      </span>
                      <span className="font-mono text-[10px] text-slate-400 dark:text-slate-500">#{wo.orderNumber}</span>
                      {warrantyBadge}
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${st.badge}`}>
                      {st.label}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm font-medium leading-snug text-slate-900 dark:text-slate-50">
                    {wo.description}
                  </p>
                  <dl className="mt-2 grid gap-x-3 gap-y-1 text-[11px] text-slate-600 sm:grid-cols-2 dark:text-slate-300">
                    <div className="min-w-0">
                      <dt className="text-slate-400 dark:text-slate-500">Alta</dt>
                      <dd className="truncate font-medium text-slate-800 dark:text-slate-100">
                        {formatWoDate(wo.createdAt)}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-slate-400 dark:text-slate-500">Técnico</dt>
                      <dd className="truncate font-medium text-slate-800 dark:text-slate-100">
                        {wo.assignedTo?.fullName ?? '—'}
                      </dd>
                    </div>
                    {wo.customerName ? (
                      <div className="min-w-0 sm:col-span-1">
                        <dt className="text-slate-400 dark:text-slate-500">Cliente</dt>
                        <dd className="truncate font-medium text-slate-800 dark:text-slate-100">{wo.customerName}</dd>
                      </div>
                    ) : null}
                    {wo.vehiclePlate ? (
                      <div>
                        <dt className="text-slate-400 dark:text-slate-500">Patente</dt>
                        <dd>
                          <span className="rounded bg-slate-100 px-1 py-0 font-mono text-[11px] text-slate-800 dark:bg-slate-800 dark:text-slate-200">
                            {wo.vehiclePlate}
                          </span>
                        </dd>
                      </div>
                    ) : null}
                    {canViewWoFinancials && wo.authorizedAmount ? (
                      <div className="sm:col-span-2">
                        <dt className="text-slate-400 dark:text-slate-500">Tope de cobros en caja</dt>
                        <dd className="font-mono font-medium text-slate-800 dark:text-slate-100">
                          {wo.authorizedAmount}
                        </dd>
                      </div>
                    ) : null}
                    {wo.parentWorkOrder ? (
                      <div className="min-w-0 sm:col-span-2">
                        <dt className="text-slate-400 dark:text-slate-500">Orden origen (garantía)</dt>
                        <dd className="truncate font-medium text-slate-800 dark:text-slate-100">
                          {wo.parentWorkOrder.publicCode}{' '}
                          <span className="font-mono text-[10px] font-normal text-slate-400 dark:text-slate-500">
                            #{wo.parentWorkOrder.orderNumber}
                          </span>{' '}
                          <span className="font-normal text-slate-500 dark:text-slate-300">
                            ({STATUS[wo.parentWorkOrder.status].label})
                          </span>
                        </dd>
                      </div>
                    ) : null}
                  </dl>
                </Link>
              </li>
            )
          }

          return (
            <li key={wo.id} className="flex min-h-0">
              <Link
                to={`/ordenes/${wo.id}`}
                className={`flex h-full min-h-[10.5rem] w-full min-w-0 flex-col rounded-xl border border-slate-200/90 border-l-4 p-3 shadow-sm transition hover:border-brand-200 hover:shadow-md dark:border-slate-700 dark:hover:border-brand-600 ${st.cardBody}`}
              >
                <div className="flex shrink-0 items-start justify-between gap-1.5">
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <span className="text-xs font-semibold tracking-tight text-slate-800 dark:text-slate-100">
                      {wo.publicCode}
                    </span>
                    <span className="font-mono text-[10px] text-slate-400 dark:text-slate-500">#{wo.orderNumber}</span>
                    {warrantyBadge}
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${st.badge}`}>
                    {st.label}
                  </span>
                </div>
                <p className="mt-1 min-h-0 flex-1 text-sm font-medium leading-snug text-slate-900 line-clamp-2 dark:text-slate-50">
                  {wo.description}
                </p>
                <div className="mt-auto flex shrink-0 items-end justify-between gap-2 pt-2">
                  <div className="min-w-0 flex-1 space-y-0.5 text-[11px] text-slate-500 dark:text-slate-300">
                    {wo.customerName ? (
                      <p className="truncate font-medium text-slate-700 dark:text-slate-200">{wo.customerName}</p>
                    ) : null}
                    <p className="text-slate-600 dark:text-slate-300">
                      Téc.: {wo.assignedTo?.fullName ?? '—'}
                    </p>
                  </div>
                  {wo.vehiclePlate ? (
                    <span
                      className="relative inline-flex shrink-0 items-center justify-center rounded-[10px] border-2 border-black bg-[#EBC012] px-3 py-2 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.35),0_3px_0_rgba(0,0,0,0.28)]"
                      title="Patente"
                    >
                      <span className={`${WO_GRID_PLATE_RIVET_CLASS} left-1 top-1`} aria-hidden />
                      <span className={`${WO_GRID_PLATE_RIVET_CLASS} right-1 top-1`} aria-hidden />
                      <span className={`${WO_GRID_PLATE_RIVET_CLASS} bottom-1 left-1`} aria-hidden />
                      <span className={`${WO_GRID_PLATE_RIVET_CLASS} bottom-1 right-1`} aria-hidden />
                      <span className="relative z-[1] text-center font-sans text-[15px] font-black uppercase leading-none tracking-[0.14em] text-black [font-stretch:condensed] [text-shadow:0_1px_0_rgba(255,255,255,0.35)] sm:text-[16px]">
                        {formatColombianPlateDisplay(wo.vehiclePlate)}
                      </span>
                    </span>
                  ) : null}
                </div>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
