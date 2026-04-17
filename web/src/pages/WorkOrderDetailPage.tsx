import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, ApiError } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { useAlert, useConfirm } from '../components/confirm/ConfirmProvider'
import { ClientConsentSignModal } from '../components/work-order/ClientConsentSignModal'
import { ClientConsentSignedModal } from '../components/work-order/ClientConsentSignedModal'
import { TransitLicenseOcrPanel } from '../components/work-order/TransitLicenseOcrPanel'
import { NotesMinCharCounter } from '../components/NotesMinCharCounter'
import {
  notesMinHint,
  parseNotesUiContext,
  SETTINGS_UI_CONTEXT_PATH,
  type SettingsUiContextResponse,
} from '../config/operationalNotes'
import { PageHeader } from '../components/layout/PageHeader'
import { useCashSessionOpen } from '../context/CashSessionOpenContext'
import { emitWorkOrderChanged } from '../lib/workOrderEvents'
import { usePanelTheme } from '../theme/PanelThemeProvider'
import type { ParsedTransitLicenseFields } from '../lib/parseTransitLicenseOcr'
import {
  API_MONEY_DECIMAL_REGEX,
  formatCopFromString,
  formatCopInteger,
  formatMoneyInputDisplayFromNormalized,
  normalizeMoneyDecimalStringForApi,
} from '../utils/copFormat'
import { successMessageWithDrawerPulse } from '../utils/cashDrawerBridge'
import {
  inventoryItemUsesQuarterGallonOtQuantity,
  partLineQuantityDisplayWithQuarters,
} from '../utils/oilQuarterGallonOt'
import {
  allowsFractionalWorkOrderPartQuantity,
  workOrderPartQuantityClientIssue,
  workOrderPartStockClientIssue,
} from '../utils/workOrderPartQuantity'
import type {
  AuthUser,
  InventoryItem,
  WorkOrderDetail,
  WorkOrderLine,
  WorkOrderLineType,
  WorkOrderPatchResult,
  WorkOrderStatus,
  WorkOrderTotals,
} from '../api/types'

/** Alineado con `WorkOrderLinesService` (API): quién puede editar/quitar repuestos PART ya cargados. */
const WORK_ORDER_PART_LINE_MANAGER_SLUGS = new Set([
  'cajero',
  'cajero_autorizado',
  'administrador',
  'dueno',
])

type PaymentRow = {
  id: string
  amount: string
  kind?: 'PARTIAL' | 'FULL_SETTLEMENT'
  createdAt: string
  note: string | null
  recordedBy: { fullName: string }
  cashMovement: {
    category: { slug: string; name: string }
    tenderAmount?: string | null
    changeAmount?: string | null
  }
}

type CashCat = { slug: string; name: string; direction: string }

/** Shape mínimo traído de `/services` y `/tax-rates` para los selectores en OT (Fase 2). */
type ServiceCatalogRow = {
  id: string
  code: string
  name: string
  defaultUnitPrice: string | null
  defaultTaxRateId: string | null
  isActive: boolean
}

type TaxRateCatalogRow = {
  id: string
  slug: string
  name: string
  kind: 'VAT' | 'INC'
  ratePercent: string
  isActive: boolean
}

/** Texto de repuesto en OT: solo SKU, categoría y nombre (sin proveedor ni stock). */
function workOrderPartDisplayText(item: Pick<InventoryItem, 'sku' | 'name'> & { category?: string | null }): string {
  const cat = (item.category ?? '').trim() || '—'
  return `${item.sku} · ${cat} · ${item.name}`
}

/**
 * Panel de totales de la OT (Fase 2).
 *
 * Se muestra solo lo que aporta valor: si la persona natural opera sin IVA ni descuentos,
 * oculta las filas vacías; cuando se activa DIAN / impuestos por línea, aparecen automáticamente.
 * `canSeeCosts` habilita costo y utilidad (administración / dueño con `reports:read`).
 */
function WorkOrderTotalsPanel({
  totals,
  canSeeCosts,
}: {
  totals: WorkOrderTotals
  canSeeCosts: boolean
}) {
  const hasDiscount = Number(totals.totalDiscount) > 0
  const hasVat = Number(totals.taxVatAmount) > 0
  const hasInc = Number(totals.taxIncAmount) > 0
  const hasAnyTax = hasVat || hasInc
  const hasAnyExtra = hasDiscount || hasAnyTax
  const hasCosts =
    canSeeCosts && totals.totalCost !== null && totals.totalProfit !== null

  // Si no hay descuentos ni impuestos ni costos disponibles, el desglose no aporta
  // info nueva frente al tile «Subtotal líneas»: evitamos ruido visual.
  if (!hasAnyExtra && !hasCosts) return null

  const row = (label: string, value: string, accent?: 'muted' | 'strong') => (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span
        className={
          accent === 'strong'
            ? 'text-sm font-semibold text-slate-800 dark:text-slate-100'
            : accent === 'muted'
              ? 'text-xs text-slate-500 dark:text-slate-400'
              : 'text-sm text-slate-600 dark:text-slate-300'
        }
      >
        {label}
      </span>
      <span
        className={
          accent === 'strong'
            ? 'font-mono text-base font-semibold tabular-nums text-slate-900 dark:text-slate-50'
            : 'font-mono text-sm tabular-nums text-slate-800 dark:text-slate-100'
        }
      >
        ${formatCopFromString(value)}
      </span>
    </div>
  )

  return (
    <section className="rounded-xl border border-slate-200 bg-white/90 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/50">
      <div className="flex items-center justify-between">
        <h3 className="va-section-title text-sm">Desglose de la orden</h3>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          Se congela por línea al guardar (cambios de IVA posteriores no alteran esta OT).
        </span>
      </div>
      <div className="mt-2 divide-y divide-slate-200 dark:divide-slate-700">
        {row('Subtotal (bruto)', totals.linesSubtotal)}
        {hasDiscount ? row('Descuentos', `-${totals.totalDiscount}`) : null}
        {hasAnyExtra ? row('Base imponible', totals.taxableBase, 'muted') : null}
        {hasVat ? row(`IVA`, totals.taxVatAmount) : null}
        {hasInc ? row('INC', totals.taxIncAmount) : null}
        {row('Total a cobrar', totals.grandTotal, 'strong')}
        {hasCosts ? (
          <>
            {row('Costo estimado (repuestos)', totals.totalCost ?? '0', 'muted')}
            {row('Utilidad estimada', totals.totalProfit ?? '0', 'strong')}
          </>
        ) : null}
      </div>
    </section>
  )
}

/** Stock disponible para nuevas líneas PART (API usa el mismo criterio al descontar). */
function inventoryItemHasAvailableStock(item: InventoryItem): boolean {
  const n = Number(item.quantityOnHand)
  return Number.isFinite(n) && n > 0
}

/** Conflictos / permisos: mejor modal que aviso discreto bajo el título. */
function isBlockingWorkOrderApiError(err: unknown): boolean {
  if (err instanceof ApiError && (err.status === 409 || err.status === 403)) return true
  const m = err instanceof Error ? err.message : ''
  return /cerrada|no admite cambios/i.test(m)
}

const STATUS: Record<WorkOrderStatus, { label: string; tone: string }> = {
  UNASSIGNED: {
    label: 'Sin asignar',
    tone: 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100',
  },
  RECEIVED: { label: 'Recibida', tone: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200' },
  IN_WORKSHOP: { label: 'En taller', tone: 'bg-blue-50 text-blue-800 dark:bg-blue-900/75 dark:text-blue-50' },
  WAITING_PARTS: {
    label: 'Esperando repuestos',
    tone: 'bg-amber-50 text-amber-900 dark:bg-amber-900/75 dark:text-amber-50',
  },
  READY: { label: 'Lista', tone: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-900/75 dark:text-emerald-50' },
  DELIVERED: { label: 'Entregada', tone: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200' },
  CANCELLED: { label: 'Cancelada', tone: 'bg-red-50 text-red-800 dark:bg-red-900/75 dark:text-red-50' },
}

/** Misma regla que el API: cobros solo en Recibida → Lista (no Sin asignar, Entregada ni Cancelada). */
const WORK_ORDER_PAYABLE_STATUSES: readonly WorkOrderStatus[] = [
  'RECEIVED',
  'IN_WORKSHOP',
  'WAITING_PARTS',
  'READY',
]

/** Cajero: solo cobros + líneas en lectura; administrador/dueño ven todo salvo que previsualicen como cajero. */
function isCashierWorkOrderSimplifiedView(u: AuthUser | null): boolean {
  if (!u) return false
  const prev = u.previewRole?.slug
  if (prev === 'cajero' || prev === 'cajero_autorizado') return true
  const slugs = u.roleSlugs ?? []
  if (slugs.includes('administrador') || slugs.includes('dueno')) return false
  return slugs.includes('cajero') || slugs.includes('cajero_autorizado')
}

/**
 * Ocultar caja/cobros/resumen de cobro en detalle de OT.
 * Basado en permisos efectivos (vista por rol incluida), no solo en `roleSlugs`, para que funcione aunque falte ese campo en sesión.
 * La vista cajero (`cashierOnly`) sigue mostrando cobros aunque el rol real sea mixto.
 */
function hideWorkOrderCashSection(u: AuthUser | null, can: (code: string) => boolean): boolean {
  if (!u || isCashierWorkOrderSimplifiedView(u)) return false
  return !can('work_orders:record_payment') || !can('cash_movements:create_income')
}

/** Consentimiento en facturación: fondo como Guardar orden; texto ámbar como «Sin técnico asignado». */
const FACTURACION_CONSENT_BTN =
  'rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-amber-800 shadow-sm hover:bg-slate-900 hover:text-amber-900 focus:outline-none focus:ring-2 focus:ring-slate-500/40 dark:bg-slate-700 dark:text-amber-200 dark:hover:bg-slate-600 dark:hover:text-amber-100'

function lineMoney(ln: WorkOrderLine): string {
  const q = Number(ln.quantity)
  const p = ln.unitPrice != null ? Number(ln.unitPrice) : 0
  if (Number.isNaN(q) || Number.isNaN(p)) return '—'
  return formatCopInteger(q * p)
}

/** Misma idea que el subtotal de líneas en la API (cantidad × precio; sin precio cuenta 0). */
function linesSubtotalFromLines(lines: WorkOrderLine[]): string {
  let sum = 0
  for (const ln of lines) {
    const q = Number(ln.quantity)
    const p = ln.unitPrice != null ? Number(ln.unitPrice) : 0
    if (!Number.isNaN(q) && !Number.isNaN(p)) sum += q * p
  }
  return formatCopInteger(sum)
}

/** Aplica la respuesta del PATCH al estado local antes de un GET detalle (actualización inmediata en pantalla). */
function mergeWorkOrderPatchIntoState(
  patch: WorkOrderPatchResult,
  setWo: Dispatch<SetStateAction<WorkOrderDetail | null>>,
  setWoStatus: (s: WorkOrderStatus) => void,
  setWoDesc: (s: string) => void,
  setWoAuth: (s: string) => void,
) {
  setWo((prev) => {
    if (!prev) return prev
    const at = patch.assignedTo
    const nextStatus = patch.status ?? prev.status
    return {
      ...prev,
      status: nextStatus,
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      assignedTo: at ? { id: at.id, fullName: at.fullName, email: at.email } : null,
      ...(patch.authorizedAmount !== undefined ? { authorizedAmount: patch.authorizedAmount } : {}),
    }
  })
  if (patch.status !== undefined) setWoStatus(patch.status)
  if (patch.description !== undefined) setWoDesc(patch.description)
  if (patch.authorizedAmount !== undefined) {
    setWoAuth(
      patch.authorizedAmount != null ? normalizeMoneyDecimalStringForApi(String(patch.authorizedAmount)) : '',
    )
  }
}

type AssignableUserRow = { id: string; fullName: string; email: string }

export function WorkOrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user, can } = useAuth()
  const navigate = useNavigate()
  const [invoiceBusy, setInvoiceBusy] = useState(false)
  const [invoiceMsg, setInvoiceMsg] = useState<string | null>(null)
  const panelTheme = usePanelTheme()
  const isSaas = panelTheme === 'saas_light'
  /** Evita que `load` cambie de identidad cada render si el contexto recrea `can`; sin esto el `useEffect` puede spamear `load()` y pisar el estado. */
  const canRef = useRef(can)
  canRef.current = can
  const confirm = useConfirm()
  const blockingAlert = useAlert()
  const [wo, setWo] = useState<WorkOrderDetail | null>(null)
  const [items, setItems] = useState<InventoryItem[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const [addKind, setAddKind] = useState<WorkOrderLineType>('PART')
  const [partItemId, setPartItemId] = useState('')
  const [partQty, setPartQty] = useState('1')
  const [partPrice, setPartPrice] = useState('')
  const [laborDesc, setLaborDesc] = useState('')
  const [laborQty, setLaborQty] = useState('1')
  const [laborPrice, setLaborPrice] = useState('')

  const [editLine, setEditLine] = useState<WorkOrderLine | null>(null)
  const [editQty, setEditQty] = useState('')
  const [editPrice, setEditPrice] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editDiscount, setEditDiscount] = useState('')
  const [editTaxRateId, setEditTaxRateId] = useState<string>('')

  // Fase 2: catálogos opcionales de Servicios e Impuestos.
  // En persona natural suelen quedar vacíos; se cargan solo si el perfil tiene permiso de lectura.
  const [servicesCatalog, setServicesCatalog] = useState<ServiceCatalogRow[]>([])
  const [taxRatesCatalog, setTaxRatesCatalog] = useState<TaxRateCatalogRow[]>([])
  const [laborServiceId, setLaborServiceId] = useState<string>('')
  const [laborTaxRateId, setLaborTaxRateId] = useState<string>('')
  const [laborDiscount, setLaborDiscount] = useState<string>('')
  const [partTaxRateId, setPartTaxRateId] = useState<string>('')
  const [partDiscount, setPartDiscount] = useState<string>('')
  const [showFiscalOptions, setShowFiscalOptions] = useState(false)

  const [payments, setPayments] = useState<PaymentRow[]>([])
  const [payAmt, setPayAmt] = useState('')
  const [payTender, setPayTender] = useState('')
  const [payNote, setPayNote] = useState('')
  const [payKind, setPayKind] = useState<'partial' | 'full'>('partial')
  const [payCat, setPayCat] = useState('ingreso_cobro')
  const [payAck, setPayAck] = useState(false)
  const [incomeCats, setIncomeCats] = useState<CashCat[]>([])
  const [notesMinPayment, setNotesMinPayment] = useState(70)
  const [notesMinGeneral, setNotesMinGeneral] = useState(50)
  const [reopenNote, setReopenNote] = useState('')
  const [reopenJustification, setReopenJustification] = useState('')
  const [reopenBusy, setReopenBusy] = useState(false)
  /** Errores del flujo de cobro: se muestran en esta sección (el `msg` global queda arriba y casi no se ve). */
  const [payFormError, setPayFormError] = useState<string | null>(null)
  const [paymentBusy, setPaymentBusy] = useState(false)
  const paymentsSectionRef = useRef<HTMLElement | null>(null)
  const { open: cashOpen, loadStatus: cashOpenLoadStatus, refresh: refreshCashOpen } = useCashSessionOpen()

  const [woDesc, setWoDesc] = useState('')
  const [woAuth, setWoAuth] = useState('')
  const [woCustomerName, setWoCustomerName] = useState('')
  const [woCustomerEmail, setWoCustomerEmail] = useState('')
  const [woCustomerPhone, setWoCustomerPhone] = useState('')
  const [woVehiclePlate, setWoVehiclePlate] = useState('')
  const [woVehicleBrand, setWoVehicleBrand] = useState('')
  const [woVehicleModel, setWoVehicleModel] = useState('')
  const [woVehicleLine, setWoVehicleLine] = useState('')
  const [woVehicleCylinderCc, setWoVehicleCylinderCc] = useState('')
  const [woVehicleColor, setWoVehicleColor] = useState('')
  const [woIntakeKm, setWoIntakeKm] = useState('')
  const [woInspectionOnly, setWoInspectionOnly] = useState(false)
  const [woStatus, setWoStatus] = useState<WorkOrderStatus>('UNASSIGNED')
  const [assignableUsers, setAssignableUsers] = useState<AssignableUserRow[] | null>(null)
  const [reassignUserId, setReassignUserId] = useState('')
  const [assignBusy, setAssignBusy] = useState(false)
  /** Consentimiento: modal ver firmado o modal registrar (ya no hay tarjeta fija en la página). */
  const [consentModal, setConsentModal] = useState<null | 'view' | 'sign'>(null)

  const cashierOnly = useMemo(() => isCashierWorkOrderSimplifiedView(user), [user])

  const canManageWoPartLines = useMemo(() => {
    const slugs = user?.previewRole?.slug ? [user.previewRole.slug] : (user?.roleSlugs ?? [])
    return slugs.some((s) => WORK_ORDER_PART_LINE_MANAGER_SLUGS.has(s))
  }, [user?.previewRole?.slug, user?.roleSlugs])
  const hideWorkOrderCashUi = useMemo(() => hideWorkOrderCashSection(user, can), [user, can])

  const applyTransitLicenseFromOcr = useCallback((p: ParsedTransitLicenseFields) => {
    if (p.plate) setWoVehiclePlate(p.plate)
    if (p.brand) setWoVehicleBrand(p.brand)
    if (p.model) setWoVehicleModel(p.model)
    if (p.line) setWoVehicleLine(p.line)
    if (p.cylinderCc) setWoVehicleCylinderCc(p.cylinderCc)
    if (p.color) setWoVehicleColor(p.color)
  }, [])

  const showBlockingConflictModal = useCallback(
    async (err: unknown) => {
      if (!wo || !isBlockingWorkOrderApiError(err)) return false
      const raw = err instanceof Error ? err.message : 'Operación no permitida'
      await blockingAlert({
        title: `Orden ${wo.publicCode} · ${STATUS[wo.status].label}`,
        message: (
          <Fragment>
            <p className="font-medium text-slate-800 dark:text-slate-100">{raw}</p>
            <p className="mt-3 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              Si necesitás modificar una orden con restricciones (por ejemplo ya cerrada o sin permiso), consultá a un
              administrador o dueño del taller.
            </p>
          </Fragment>
        ),
        okLabel: 'Entendido',
      })
      return true
    },
    [wo, blockingAlert],
  )

  const load = useCallback(async () => {
    if (!id) return
    const canNow = canRef.current
    setErr(null)
    try {
      const bust = `_=${Date.now()}`
      const data = await api<WorkOrderDetail>(`/work-orders/${id}?${bust}`)
      setWo(data)
      setWoDesc(data.description)
      setWoAuth(
        data.authorizedAmount != null ? normalizeMoneyDecimalStringForApi(String(data.authorizedAmount)) : '',
      )
      setWoCustomerName((data.customerName ?? '').trim())
      setWoCustomerEmail((data.customerEmail ?? '').trim())
      setWoCustomerPhone((data.customerPhone ?? '').trim())
      setWoVehiclePlate((data.vehiclePlate ?? '').trim())
      setWoVehicleBrand((data.vehicleBrand ?? '').trim())
      setWoVehicleModel((data.vehicleModel ?? '').trim())
      setWoVehicleLine((data.vehicleLine ?? '').trim())
      setWoVehicleCylinderCc((data.vehicleCylinderCc ?? '').trim())
      setWoVehicleColor((data.vehicleColor ?? '').trim())
      setWoIntakeKm(data.intakeOdometerKm != null ? String(data.intakeOdometerKm) : '')
      setWoInspectionOnly(Boolean(data.inspectionOnly))
      setWoStatus(data.status)
      if (hideWorkOrderCashUi) {
        setPayments([])
      } else if (canNow('work_orders:read')) {
        try {
          setPayments(await api<PaymentRow[]>(`/work-orders/${id}/payments?${bust}`))
        } catch {
          setPayments([])
        }
      }
    } catch (err) {
      throw err
    }
  }, [id, hideWorkOrderCashUi])

  /** Lista y subtotal desde endpoints dedicados (evita JSON del detalle de OT en caché tras mutar líneas). */
  const refreshLinesOnWorkOrder = useCallback(async () => {
    if (!id) return
    const qs = `_=${Date.now()}`
    const lines = await api<WorkOrderLine[]>(`/work-orders/${id}/lines?${qs}`)
    const linesSubtotal = canRef.current('work_orders:view_financials') ||
      canRef.current('work_order_lines:set_unit_price') ||
      canRef.current('work_orders:record_payment')
      ? linesSubtotalFromLines(lines)
      : null
    setWo((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        lines,
        linesSubtotal,
      }
    })
  }, [id])

  useEffect(() => {
    setConsentModal(null)
  }, [id])

  useEffect(() => {
    if (!id) return
    let cancelled = false
    ;(async () => {
      try {
        await load()
      } catch {
        if (!cancelled) setErr('No se pudo cargar la orden')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [id, load])

  useEffect(() => {
    if (cashierOnly || !can('inventory_items:read')) return
    let cancelled = false
    ;(async () => {
      try {
        const list = await api<InventoryItem[]>('/inventory/items')
        if (!cancelled) {
          setItems(list.filter((i) => i.trackStock && i.isActive && inventoryItemHasAvailableStock(i)))
        }
      } catch {
        /* opcional */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [can, cashierOnly])

  useEffect(() => {
    if (partItemId && !items.some((i) => i.id === partItemId)) {
      setPartItemId('')
    }
  }, [items, partItemId])

  useEffect(() => {
    void api<SettingsUiContextResponse>(SETTINGS_UI_CONTEXT_PATH)
      .then((r) => {
        const ctx = parseNotesUiContext(r)
        setNotesMinPayment(ctx.notesMinLengthWorkOrderPayment)
        setNotesMinGeneral(ctx.notesMinLengthChars)
      })
      .catch(() => undefined)
  }, [])

  // Fase 2: los catálogos solo se leen cuando el usuario tiene permiso (si no, simplemente se quedan vacíos).
  // No condicionamos el montado del editor de líneas a estos catálogos: si están vacíos, los selects no aparecen.
  useEffect(() => {
    const want = canRef.current('services:read') || canRef.current('tax_rates:read')
    if (!want) return
    if (canRef.current('services:read')) {
      void api<{ items: ServiceCatalogRow[] }>(`/services?activeOnly=true`)
        .then((r) => setServicesCatalog(Array.isArray(r.items) ? r.items : []))
        .catch(() => undefined)
    }
    if (canRef.current('tax_rates:read')) {
      void api<{ items: TaxRateCatalogRow[] }>(`/tax-rates?activeOnly=true`)
        .then((r) => setTaxRatesCatalog(Array.isArray(r.items) ? r.items : []))
        .catch(() => undefined)
    }
  }, [])

  useEffect(() => {
    if (wo && payKind === 'full' && wo.amountDue != null) {
      setPayAmt(normalizeMoneyDecimalStringForApi(wo.amountDue))
    }
  }, [wo?.id, wo?.amountDue, payKind])

  useEffect(() => {
    setPayFormError(null)
  }, [payKind, payAmt, payNote, payAck, payTender])

  useEffect(() => {
    if (hideWorkOrderCashUi || !can('cash_movements:create_income')) return
    void api<CashCat[]>('/cash/categories')
      .then((c) => {
        const inc = c.filter((x) => x.direction === 'INCOME')
        setIncomeCats(inc)
        setPayCat((prev) => (inc.some((x) => x.slug === prev) ? prev : inc[0]?.slug ?? 'ingreso_cobro'))
      })
      .catch(() => undefined)
  }, [can, hideWorkOrderCashUi])

  const closed = wo?.status === 'DELIVERED' || wo?.status === 'CANCELLED'
  const hasLaborLine = (wo?.lines ?? []).some((l) => String(l.lineType).toUpperCase() === 'LABOR')

  useEffect(() => {
    if (hasLaborLine && addKind === 'LABOR') setAddKind('PART')
  }, [hasLaborLine, addKind])

  const canMutateLines =
    wo &&
    !closed &&
    !cashierOnly &&
    can('work_orders:update') &&
    can('work_order_lines:create')
  const canDeleteLine =
    wo && !closed && !cashierOnly && can('work_orders:update') && can('work_order_lines:delete')
  const canUpdateLine =
    wo && !closed && !cashierOnly && can('work_orders:update') && can('work_order_lines:update')
  const canEditPartLine = Boolean(canUpdateLine && canManageWoPartLines)
  const canDeletePartLine = Boolean(canDeleteLine && canManageWoPartLines)
  const canViewWoFinancials = useMemo(
    () =>
      can('work_orders:view_financials') ||
      can('work_order_lines:set_unit_price') ||
      can('work_orders:record_payment'),
    [can],
  )
  /**
   * Mostrar formulario abono / pago total: permisos + caja abierta (no exigir estado aquí: si la OT está en
   * «Sin asignar» u otra etapa no cobrable, el usuario igual ve el bloque con aviso y el botón deshabilitado).
   */
  const paymentFormOpen =
    Boolean(wo) &&
    !hideWorkOrderCashUi &&
    cashOpen === true &&
    can('work_orders:record_payment') &&
    can('cash_movements:create_income')

  const workOrderStatusAllowsPayment =
    wo != null && WORK_ORDER_PAYABLE_STATUSES.includes(wo.status)

  const canSubmitWorkOrderPayment =
    paymentFormOpen && workOrderStatusAllowsPayment && wo != null && wo.amountDue != null

  /** Cobros en OT: solo con sesión de caja abierta (todos los roles; capa global). */
  const showCobrosCajaFull = !hideWorkOrderCashUi && cashOpen === true
  const showCobrosCajaBlocked = !hideWorkOrderCashUi && cashOpen !== true

  const canPatchWo = wo && can('work_orders:update') && !cashierOnly
  const detailRootClass = isSaas ? 'space-y-7' : 'space-y-8'
  const backLinkClass = isSaas
    ? 'text-sm font-medium text-brand-700 underline-offset-2 hover:underline dark:text-brand-300 dark:hover:text-brand-200'
    : 'text-sm font-medium text-brand-700 hover:underline dark:text-brand-300 dark:hover:text-brand-200'
  const sectionCardClass = isSaas ? 'va-saas-page-section' : 'va-card'
  const sectionFlushClass = isSaas ? 'va-saas-page-section va-saas-page-section--flush' : 'va-card-flush overflow-hidden'
  const financialStatTileClass = isSaas ? 'va-saas-panel-tile !p-4' : 'va-card !p-4'
  const sectionHeadClass = isSaas ? 'va-saas-section-head' : 'border-b border-slate-100 px-4 py-3 sm:px-6 dark:border-slate-800'

  const canReopenDelivered =
    wo?.status === 'DELIVERED' && can('work_orders:reopen_delivered') && !cashierOnly

  const selectableStatuses = useMemo((): WorkOrderStatus[] => {
    /** «Sin asignar» con técnico asignado solo tiene sentido con permiso de reasignación (quita técnico al guardar). */
    const flow: WorkOrderStatus[] = []
    if (!wo?.assignedTo || can('work_orders:reassign')) {
      flow.push('UNASSIGNED')
    }
    flow.push('RECEIVED', 'IN_WORKSHOP', 'WAITING_PARTS', 'READY')
    const withTerminal = can('work_orders:set_terminal_status')
      ? ([...flow, 'DELIVERED', 'CANCELLED'] as WorkOrderStatus[])
      : flow
    if (!wo) return withTerminal
    if (!withTerminal.includes(wo.status)) return [...withTerminal, wo.status]
    return withTerminal
  }, [can, wo])

  useEffect(() => {
    if (!id || !canRef.current('work_orders:reassign') || cashierOnly) {
      setAssignableUsers(null)
      return
    }
    let cancelled = false
    void api<AssignableUserRow[]>(`/work-orders/assignable-users?_=${Date.now()}`)
      .then((list) => {
        if (!cancelled) setAssignableUsers(list)
      })
      .catch(() => {
        if (!cancelled) setAssignableUsers([])
      })
    return () => {
      cancelled = true
    }
  }, [id, cashierOnly])

  function sameMoney(a: string, b: string): boolean {
    const x = Number(normalizeMoneyDecimalStringForApi(a) || 0)
    const y = Number(normalizeMoneyDecimalStringForApi(b) || 0)
    if (Number.isNaN(x) || Number.isNaN(y)) return false
    return Math.abs(x - y) < 0.005
  }

  const payVueltoHint = useMemo(() => {
    const aNorm = normalizeMoneyDecimalStringForApi(payAmt)
    const tNorm = normalizeMoneyDecimalStringForApi(payTender)
    const a = Number(aNorm)
    const t = Number(tNorm)
    if (!tNorm) return null
    if (Number.isNaN(a) || Number.isNaN(t) || a <= 0) return 'Completá el monto del cobro.'
    if (t < a) return 'El efectivo recibido debe ser mayor o igual al monto del cobro.'
    const ch = t - a
    if (ch === 0) return 'Vuelto: $0 (pago exacto).'
    return `Vuelto a entregar: $${formatCopFromString(String(ch))}.`
  }, [payAmt, payTender])

  const partOptions = useMemo(
    () =>
      items.map((i) => (
        <option key={i.id} value={i.id}>
          {workOrderPartDisplayText(i)}
        </option>
      )),
    [items],
  )

  const selectedPartItem = useMemo(
    () => items.find((i) => i.id === partItemId),
    [items, partItemId],
  )

  const partQtyIssue = useMemo(() => {
    const slug = selectedPartItem?.measurementUnit.slug
    const base = workOrderPartQuantityClientIssue(partQty, slug, selectedPartItem)
    if (base) return base
    if (!selectedPartItem) return null
    const max = Number(selectedPartItem.quantityOnHand)
    return workOrderPartStockClientIssue(partQty, Number.isFinite(max) ? max : null, selectedPartItem)
  }, [partQty, selectedPartItem])

  const editQtyIssue = useMemo(() => {
    if (!editLine) return null
    const slug =
      editLine.lineType === 'PART' ? editLine.inventoryItem?.measurementUnit.slug : undefined
    const partItem = editLine.lineType === 'PART' ? editLine.inventoryItem : null
    const base = workOrderPartQuantityClientIssue(editQty, slug, partItem)
    if (base) return base
    if (editLine.lineType !== 'PART' || !editLine.inventoryItem) return null
    const lineQty = Number(editLine.quantity)
    const onHand = Number(editLine.inventoryItem.quantityOnHand)
    if (!Number.isFinite(lineQty) || !Number.isFinite(onHand)) return null
    const maxAllowed = lineQty + onHand
    return workOrderPartStockClientIssue(editQty, maxAllowed, editLine.inventoryItem)
  }, [editLine, editQty])

  async function addLine() {
    if (!id || !canMutateLines) return
    setMsg(null)
    const lineKind: WorkOrderLineType = hasLaborLine ? 'PART' : addKind
    try {
      if (lineKind === 'PART') {
        if (partQtyIssue) {
          setMsg(partQtyIssue)
          return
        }
        const partUp = canViewWoFinancials ? normalizeMoneyDecimalStringForApi(partPrice) : ''
        if (canViewWoFinancials && partUp && !API_MONEY_DECIMAL_REGEX.test(partUp)) {
          setMsg(
            'Precio al cliente: solo pesos enteros; miles con punto (ej. 25.000).',
          )
          return
        }
        const partDiscountNorm = canViewWoFinancials && partDiscount.trim()
          ? normalizeMoneyDecimalStringForApi(partDiscount)
          : ''
        if (partDiscountNorm && !API_MONEY_DECIMAL_REGEX.test(partDiscountNorm)) {
          setMsg('Descuento: solo pesos enteros; miles con punto (ej. 2.000).')
          return
        }
        await api(`/work-orders/${id}/lines`, {
          method: 'POST',
          body: JSON.stringify({
            lineType: 'PART',
            inventoryItemId: partItemId,
            quantity: partQty,
            ...(canViewWoFinancials && partUp ? { unitPrice: partUp } : {}),
            ...(partTaxRateId ? { taxRateId: partTaxRateId } : {}),
            ...(partDiscountNorm ? { discountAmount: partDiscountNorm } : {}),
          }),
        })
      } else {
        const laborUp = canViewWoFinancials ? normalizeMoneyDecimalStringForApi(laborPrice) : ''
        if (canViewWoFinancials && laborUp && !API_MONEY_DECIMAL_REGEX.test(laborUp)) {
          setMsg(
            'Precio mano de obra: solo pesos enteros; miles con punto (ej. 150.000).',
          )
          return
        }
        const laborDiscountNorm = canViewWoFinancials && laborDiscount.trim()
          ? normalizeMoneyDecimalStringForApi(laborDiscount)
          : ''
        if (laborDiscountNorm && !API_MONEY_DECIMAL_REGEX.test(laborDiscountNorm)) {
          setMsg('Descuento: solo pesos enteros; miles con punto (ej. 2.000).')
          return
        }
        // Si viene un servicio y no hay descripción, el backend completa con el nombre del servicio.
        const payload: Record<string, unknown> = {
          lineType: 'LABOR',
          description: laborDesc.trim(),
          quantity: laborQty,
        }
        if (canViewWoFinancials && laborUp) payload.unitPrice = laborUp
        if (laborServiceId) payload.serviceId = laborServiceId
        if (laborTaxRateId) payload.taxRateId = laborTaxRateId
        if (laborDiscountNorm) payload.discountAmount = laborDiscountNorm
        await api(`/work-orders/${id}/lines`, { method: 'POST', body: JSON.stringify(payload) })
      }
      try {
        await refreshLinesOnWorkOrder()
      } catch {
        await load()
      }
      setMsg('Línea agregada')
      setLaborDesc('')
      setPartPrice('')
      setLaborPrice('')
      setLaborServiceId('')
      setLaborTaxRateId('')
      setLaborDiscount('')
      setPartTaxRateId('')
      setPartDiscount('')
    } catch (e) {
      if (!(await showBlockingConflictModal(e))) {
        setMsg(e instanceof Error ? e.message : 'Error al agregar')
      }
    }
  }

  async function takeWorkOrder() {
    if (!id || !user || !wo || closed) return
    if (!user.id?.trim()) {
      setMsg('Sesión incompleta (falta id de usuario). Cerrá sesión y volvé a entrar.')
      return
    }
    setMsg(null)
    setAssignBusy(true)
    try {
      const updated = await api<WorkOrderPatchResult>(`/work-orders/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ assignedToId: user.id }),
      })
      try {
        mergeWorkOrderPatchIntoState(updated, setWo, setWoStatus, setWoDesc, setWoAuth)
      } catch {
        /* respuesta distinta a la esperada; load() alinea con el servidor */
      }
      emitWorkOrderChanged(id)
      setMsg(
        updated.status === 'RECEIVED'
          ? 'Orden en estado Recibida y asignada a vos'
          : 'Asignación actualizada',
      )
      await load()
    } catch (e) {
      if (!(await showBlockingConflictModal(e))) {
        setMsg(e instanceof Error ? e.message : 'Error')
      }
    } finally {
      setAssignBusy(false)
    }
  }

  async function submitReassign() {
    if (!id || !reassignUserId || !wo || closed) return
    setMsg(null)
    setAssignBusy(true)
    try {
      const updated = await api<WorkOrderPatchResult>(`/work-orders/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ assignedToId: reassignUserId }),
      })
      try {
        mergeWorkOrderPatchIntoState(updated, setWo, setWoStatus, setWoDesc, setWoAuth)
      } catch {
        /* idem takeWorkOrder */
      }
      emitWorkOrderChanged(id)
      setMsg(
        updated.status === 'RECEIVED' && updated.assignedTo
          ? `Orden en estado Recibida y asignada a ${updated.assignedTo.fullName}`
          : 'Asignación actualizada',
      )
      setReassignUserId('')
      await load()
    } catch (e) {
      if (!(await showBlockingConflictModal(e))) {
        setMsg(e instanceof Error ? e.message : 'Error')
      }
    } finally {
      setAssignBusy(false)
    }
  }

  async function saveWorkOrder(e: React.FormEvent) {
    e.preventDefault()
    if (!id || !canPatchWo || !wo) return
    setMsg(null)

    const prevAuth = wo.authorizedAmount != null ? String(wo.authorizedAmount) : ''
    const prevAuthNorm = prevAuth ? normalizeMoneyDecimalStringForApi(prevAuth) : ''
    const authNorm = normalizeMoneyDecimalStringForApi(woAuth)
    if (authNorm && !API_MONEY_DECIMAL_REGEX.test(authNorm)) {
      setMsg(
        'Tope de cobros: solo pesos enteros; miles con punto (ej. 2.550.356).',
      )
      return
    }
    const newAuthNum = authNorm === '' ? null : Number(authNorm)
    const totalPaid = Number(wo.paymentSummary.totalPaid ?? 0)
    const cancelNow = woStatus === 'CANCELLED' && wo.status !== 'CANCELLED'
    const descChanged = woDesc.trim() !== wo.description
    const statusChanged = woStatus !== wo.status
    const authChanged = canViewWoFinancials && authNorm !== prevAuthNorm

    const prevCustomerName = (wo.customerName ?? '').trim()
    const newCustomerName = woCustomerName.trim()
    const nameChanged = newCustomerName !== prevCustomerName

    const prevEmail = (wo.customerEmail ?? '').trim()
    const newEmail = woCustomerEmail.trim()
    const emailChanged = newEmail !== prevEmail

    const prevPhone = (wo.customerPhone ?? '').trim()
    const newPhone = woCustomerPhone.trim()
    const phoneChanged = newPhone !== prevPhone

    const prevPlate = (wo.vehiclePlate ?? '').trim()
    const newPlate = woVehiclePlate.trim()
    const plateChanged = newPlate !== prevPlate

    const prevBrand = (wo.vehicleBrand ?? '').trim()
    const newBrand = woVehicleBrand.trim()
    const brandChanged = newBrand !== prevBrand

    const prevModel = (wo.vehicleModel ?? '').trim()
    const newModel = woVehicleModel.trim()
    const modelChanged = newModel !== prevModel

    const prevLine = (wo.vehicleLine ?? '').trim()
    const newLine = woVehicleLine.trim()
    const lineChanged = newLine !== prevLine

    const prevCylinder = (wo.vehicleCylinderCc ?? '').trim()
    const newCylinder = woVehicleCylinderCc.trim()
    const cylinderChanged = newCylinder !== prevCylinder

    const prevVehicleColor = (wo.vehicleColor ?? '').trim()
    const newVehicleColor = woVehicleColor.trim()
    const vehicleColorChanged = newVehicleColor !== prevVehicleColor

    const prevKm = wo.intakeOdometerKm ?? null
    const kmTrim = woIntakeKm.trim()
    let newKmParsed: number | null = null
    if (kmTrim !== '') {
      const n = Number(kmTrim)
      if (!Number.isInteger(n) || n < 0 || n > 9_999_999) {
        setMsg('Kilometraje: usá un entero entre 0 y 9.999.999, o dejá vacío si no aplica.')
        return
      }
      newKmParsed = n
    }
    const kmChanged = newKmParsed !== prevKm

    const inspectionChanged = woInspectionOnly !== Boolean(wo.inspectionOnly)

    if (newEmail !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      setMsg('Correo: ingresá un correo válido o dejá el campo vacío.')
      return
    }

    if (
      !descChanged &&
      !statusChanged &&
      !authChanged &&
      !nameChanged &&
      !emailChanged &&
      !phoneChanged &&
      !plateChanged &&
      !brandChanged &&
      !modelChanged &&
      !lineChanged &&
      !cylinderChanged &&
      !vehicleColorChanged &&
      !kmChanged &&
      !inspectionChanged
    ) {
      setMsg('Sin cambios en datos de la orden')
      return
    }

    const lines: string[] = [`¿Guardar cambios en la orden ${wo.publicCode} (#${wo.orderNumber})?`, '']
    if (descChanged) lines.push('· Descripción modificada')
    if (statusChanged) lines.push(`· Estado: ${STATUS[wo.status].label} → ${STATUS[woStatus].label}`)
    if (
      statusChanged &&
      woStatus === 'UNASSIGNED' &&
      wo.assignedTo &&
      can('work_orders:reassign')
    ) {
      lines.push('· Se quita el técnico asignado y la orden vuelve a la cola «Sin asignar».')
    }
    if (authChanged) {
      lines.push(
        `· Tope cobros: ${prevAuthNorm ? formatCopFromString(prevAuthNorm) : 'sin tope'} → ${authNorm ? formatCopFromString(authNorm) : 'sin tope'}`,
      )
    }
    if (nameChanged) lines.push(`· Cliente: ${prevCustomerName || '—'} → ${newCustomerName || '—'}`)
    if (emailChanged) lines.push(`· Correo: ${prevEmail || '—'} → ${newEmail || '—'}`)
    if (phoneChanged) lines.push(`· Teléfono: ${prevPhone || '—'} → ${newPhone || '—'}`)
    if (plateChanged) lines.push(`· Patente: ${prevPlate || '—'} → ${newPlate || '—'}`)
    if (brandChanged) lines.push(`· Marca vehículo: ${prevBrand || '—'} → ${newBrand || '—'}`)
    if (modelChanged) lines.push(`· Modelo: ${prevModel || '—'} → ${newModel || '—'}`)
    if (lineChanged) lines.push(`· Línea: ${prevLine || '—'} → ${newLine || '—'}`)
    if (cylinderChanged) {
      lines.push(`· Cilindraje: ${prevCylinder || '—'} → ${newCylinder || '—'}`)
    }
    if (vehicleColorChanged) {
      lines.push(`· Color vehículo: ${prevVehicleColor || '—'} → ${newVehicleColor || '—'}`)
    }
    if (kmChanged) {
      lines.push(
        `· Km al ingreso: ${prevKm != null ? String(prevKm) : '—'} → ${newKmParsed != null ? String(newKmParsed) : '—'}`,
      )
    }
    if (inspectionChanged) {
      lines.push(`· Solo revisión: ${wo.inspectionOnly ? 'sí' : 'no'} → ${woInspectionOnly ? 'sí' : 'no'}`)
    }
    if (cancelNow) {
      lines.push('', '⚠ La orden pasará a CANCELADA. Revisá cobros y líneas antes de continuar.')
    }
    if (newAuthNum != null && !Number.isNaN(newAuthNum) && totalPaid > newAuthNum) {
      lines.push('', '⚠ El tope es menor que el total ya cobrado en esta OT; el servidor puede rechazar el guardado.')
    }
    const okSave = await confirm({
      title: `Orden ${wo.publicCode}`,
      message: lines.join('\n'),
      confirmLabel: 'Guardar orden',
      variant: cancelNow ? 'danger' : 'default',
    })
    if (!okSave) return

    try {
      await api(`/work-orders/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          description: woDesc.trim(),
          status: woStatus,
          ...(canViewWoFinancials ? { authorizedAmount: authNorm === '' ? null : authNorm } : {}),
          customerName: newCustomerName === '' ? null : newCustomerName,
          customerEmail: newEmail === '' ? null : newEmail,
          customerPhone: newPhone === '' ? null : newPhone,
          vehiclePlate: newPlate === '' ? null : newPlate,
          vehicleBrand: newBrand === '' ? null : newBrand,
          vehicleModel: newModel === '' ? null : newModel,
          vehicleLine: newLine === '' ? null : newLine,
          vehicleCylinderCc: newCylinder === '' ? null : newCylinder,
          vehicleColor: newVehicleColor === '' ? null : newVehicleColor,
          intakeOdometerKm: newKmParsed,
          inspectionOnly: woInspectionOnly,
        }),
      })
      setMsg('Orden actualizada')
      emitWorkOrderChanged(id)
      await load()
    } catch (err) {
      if (!(await showBlockingConflictModal(err))) {
        setMsg(err instanceof Error ? err.message : 'Error')
      }
    }
  }

  async function submitReopenDelivered() {
    if (!id || !wo || wo.status !== 'DELIVERED' || !can('work_orders:reopen_delivered')) return
    const j = reopenJustification.trim()
    const n = reopenNote.trim()
    if (j.length < notesMinGeneral) {
      setMsg(`Justificación: al menos ${notesMinGeneral} caracteres.`)
      return
    }
    if (n.length < notesMinGeneral) {
      setMsg(`Nota de reapertura: al menos ${notesMinGeneral} caracteres.`)
      return
    }
    const ok = await confirm({
      title: `Reabrir orden ${wo.publicCode}`,
      message:
        'La orden volverá a estado Lista para permitir editar líneas y montos. La justificación y la nota quedarán registradas.',
      confirmLabel: 'Reabrir',
      variant: 'danger',
    })
    if (!ok) return
    setMsg(null)
    setReopenBusy(true)
    try {
      await api(`/work-orders/${id}/reopen-delivered`, {
        method: 'POST',
        body: JSON.stringify({ justification: j, note: n }),
      })
      setReopenNote('')
      setReopenJustification('')
      setMsg('Orden reabierta a Lista')
      emitWorkOrderChanged(id)
      await load()
    } catch (err) {
      if (!(await showBlockingConflictModal(err))) {
        setMsg(err instanceof Error ? err.message : 'Error al reabrir')
      }
    } finally {
      setReopenBusy(false)
    }
  }

  function scrollPaymentsIntoView() {
    paymentsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  async function recordPayment(e: React.FormEvent) {
    e.preventDefault()
    if (!id || !wo || !paymentFormOpen) return
    if (paymentBusy) return
    setPayFormError(null)
    if (!WORK_ORDER_PAYABLE_STATUSES.includes(wo.status)) {
      setPayFormError(
        'Solo se puede cobrar con la orden en Recibida, En taller, Esperando repuestos o Lista. Cambiá el estado de la orden y reintentá.',
      )
      scrollPaymentsIntoView()
      return
    }
    if (!payAck) {
      setPayFormError(
        'Marcá la casilla de confirmación: revisaste tipo de cobro (abono o pago total), categoría, monto, efectivo recibido (si aplica), nota y saldo antes de registrar el cobro.',
      )
      scrollPaymentsIntoView()
      return
    }
    const pn = payNote.trim()
    if (pn.length < notesMinPayment) {
      setPayFormError(`Nota del cobro: al menos ${notesMinPayment} caracteres (política del taller).`)
      scrollPaymentsIntoView()
      return
    }
    const payAmtNorm = normalizeMoneyDecimalStringForApi(payAmt)
    if (!payAmtNorm || !API_MONEY_DECIMAL_REGEX.test(payAmtNorm)) {
      setPayFormError(
        'Monto del cobro: solo pesos enteros; podés separar miles con punto (ej. 2.550.356).',
      )
      scrollPaymentsIntoView()
      return
    }
    const payN = Number(payAmtNorm)
    if (!Number.isFinite(payN) || payN <= 0) {
      setPayFormError('Ingresá un monto de cobro válido mayor a cero.')
      scrollPaymentsIntoView()
      return
    }
    const tenNorm = normalizeMoneyDecimalStringForApi(payTender)
    if (tenNorm && !API_MONEY_DECIMAL_REGEX.test(tenNorm)) {
      setPayFormError(
        'Efectivo recibido: solo pesos enteros; miles con punto (mismo criterio que el monto del cobro).',
      )
      scrollPaymentsIntoView()
      return
    }
    if (wo.amountDue == null) {
      setPayFormError('Tu perfil no puede ver importes de esta orden; el cobro lo registra caja.')
      scrollPaymentsIntoView()
      return
    }
    const dueNum = Number(normalizeMoneyDecimalStringForApi(wo.amountDue) || wo.amountDue)
    if (!Number.isFinite(dueNum) || dueNum <= 0) {
      setPayFormError('No hay saldo pendiente según el sistema; no se puede registrar un cobro desde acá.')
      scrollPaymentsIntoView()
      return
    }
    if (payKind === 'full') {
      if (!sameMoney(payAmtNorm, wo.amountDue)) {
        setPayFormError(
          `Pago total: el monto debe ser exactamente el saldo pendiente ($${formatCopFromString(normalizeMoneyDecimalStringForApi(wo.amountDue) || wo.amountDue)}). Ajustá el importe o elegí «Abono».`,
        )
        scrollPaymentsIntoView()
        return
      }
    } else if (payN >= dueNum) {
      setPayFormError(
        'Con «Abono» el monto tiene que ser menor al saldo pendiente. Si querés liquidar todo, elegí «Pago total» (el monto se ajusta solo al saldo).',
      )
      scrollPaymentsIntoView()
      return
    }
    const catName = incomeCats.find((c) => c.slug === payCat)?.name ?? payCat
    const remain = wo.paymentSummary.remaining
    const authLine = wo.authorizedAmount != null ? String(wo.authorizedAmount) : 'sin tope'
    const ten = tenNorm
    const aNum = Number(payAmtNorm)
    const tNum = Number(ten)
    const vueltoStr =
      ten && !Number.isNaN(aNum) && !Number.isNaN(tNum) && tNum >= aNum ? formatCopFromString(String(tNum - aNum)) : null

    setPaymentBusy(true)
    let okPay = false
    try {
      okPay = await confirm({
      title: 'Registrar cobro',
      message: (
        <div className="space-y-3 text-left">
          <p className="font-medium text-slate-800 dark:text-slate-100">¿Registrar cobro en caja vinculado a esta orden?</p>
          <dl className="space-y-2.5 rounded-xl border border-slate-200/90 bg-slate-50/90 p-3.5 dark:border-slate-600 dark:bg-slate-800/60">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-300">
                Monto del cobro
              </dt>
              <dd className="text-lg font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                ${formatCopFromString(payAmtNorm)}
              </dd>
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-t border-slate-200/80 pt-2.5 text-sm dark:border-slate-600/80">
              <dt className="text-xs text-slate-500 dark:text-slate-300">Tipo</dt>
              <dd className="font-medium text-slate-800 dark:text-slate-100">
                {payKind === 'full' ? 'Pago total (cierra y entrega)' : 'Abono'}
              </dd>
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-t border-slate-200/80 pt-2.5 text-sm dark:border-slate-600/80">
              <dt className="text-xs text-slate-500 dark:text-slate-300">Categoría</dt>
              <dd className="font-medium text-slate-800 dark:text-slate-100">{catName}</dd>
            </div>
            <div className="space-y-1 border-t border-slate-200/80 pt-2.5 text-xs text-slate-600 dark:border-slate-600/80 dark:text-slate-300">
              <p>
                <span className="text-slate-500 dark:text-slate-300">
                  Orden {wo.publicCode}{' '}
                  <span className="font-mono text-[10px] text-slate-400 dark:text-slate-500">#{wo.orderNumber}</span>
                </span>
              </p>
              <p>
                Subtotal líneas: <span className="font-mono font-medium">${wo.linesSubtotal}</span>
              </p>
              <p>
                Ya cobrado en OT: <span className="font-mono font-medium">${wo.paymentSummary.totalPaid}</span>
              </p>
              <p>
                Tope autorizado: <span className="font-mono font-medium">{authLine}</span>
              </p>
              {remain != null && (
                <p>
                  Saldo bajo tope: <span className="font-mono font-medium">${remain}</span>
                </p>
              )}
              <p>
                Saldo pendiente (cobro): <span className="font-mono font-medium">${wo.amountDue}</span>
              </p>
            </div>
            {ten ? (
              <Fragment>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-t border-slate-200/80 pt-2.5 dark:border-slate-600/80">
                  <dt className="text-xs font-medium uppercase tracking-wide text-sky-700/90 dark:text-sky-300/90">
                    Efectivo del cliente
                  </dt>
                  <dd className="text-lg font-bold tabular-nums text-sky-600 dark:text-sky-400">${formatCopFromString(ten)}</dd>
                </div>
                {vueltoStr != null && (
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-t border-amber-200/80 pt-2.5 dark:border-amber-900/50">
                    <dt className="text-xs font-medium uppercase tracking-wide text-amber-800 dark:text-amber-200/90">
                      Vuelto a entregar
                    </dt>
                    <dd className="text-lg font-bold tabular-nums text-amber-600 dark:text-amber-400">${vueltoStr}</dd>
                  </div>
                )}
              </Fragment>
            ) : null}
          </dl>
          <p className="text-xs text-slate-500 dark:text-slate-300">Se generará un ingreso en caja vinculado a esta orden.</p>
        </div>
      ),
      confirmLabel: 'Registrar cobro',
    })
    } finally {
      setPaymentBusy(false)
    }
    if (!okPay) return

    setPaymentBusy(true)
    try {
      await api(`/work-orders/${id}/payments`, {
        method: 'POST',
        body: JSON.stringify({
          paymentKind: payKind,
          amount: payAmtNorm,
          note: pn,
          categorySlug: payCat,
          ...(tenNorm ? { tenderAmount: tenNorm } : {}),
        }),
      })
      setPayAmt('')
      setPayTender('')
      setPayNote('')
      setPayAck(false)
      setPayFormError(null)
      setMsg(await successMessageWithDrawerPulse('Cobro registrado'))
      await load()
      await refreshCashOpen()
    } catch (err) {
      const m = err instanceof Error ? err.message : 'Error al registrar el cobro'
      if (!(await showBlockingConflictModal(err))) {
        setPayFormError(m)
        scrollPaymentsIntoView()
      } else {
        setPayFormError(null)
      }
    } finally {
      setPaymentBusy(false)
    }
  }

  async function removeLine(lineId: string) {
    if (!id || !canDeleteLine || !wo) return
    const ln = wo.lines.find((l) => l.id === lineId)
    if (!ln) return
    if (ln.lineType === 'PART' && !canManageWoPartLines) return
    const ok = await confirm({
      title: 'Quitar línea',
      message: '¿Eliminar esta línea de la orden? El importe de la OT se recalculará.',
      confirmLabel: 'Eliminar',
      variant: 'danger',
    })
    if (!ok) return
    setMsg(null)
    let lines: WorkOrderLine[]
    try {
      lines = await api<WorkOrderLine[]>(`/work-orders/${id}/lines/${lineId}`, { method: 'DELETE' })
    } catch (e) {
      if (!(await showBlockingConflictModal(e))) {
        setMsg(e instanceof Error ? e.message : 'Error al eliminar')
      }
      return
    }
    if (!Array.isArray(lines)) {
      try {
        await refreshLinesOnWorkOrder()
      } catch {
        await load()
      }
    } else {
      const linesSubtotal =
        canRef.current('work_orders:view_financials') ||
        canRef.current('work_order_lines:set_unit_price') ||
        canRef.current('work_orders:record_payment')
          ? linesSubtotalFromLines(lines)
          : null
      setWo((prev) => {
        if (!prev) return prev
        return { ...prev, lines, linesSubtotal }
      })
    }
    setEditLine((el) => (el?.id === lineId ? null : el))
    setMsg('Línea eliminada')
  }

  function startEdit(ln: WorkOrderLine) {
    setEditLine(ln)
    if (
      ln.lineType === 'PART' &&
      ln.inventoryItem &&
      inventoryItemUsesQuarterGallonOtQuantity(ln.inventoryItem)
    ) {
      const g = Number(String(ln.quantity).replace(',', '.'))
      setEditQty(Number.isFinite(g) ? String(Math.round(g * 4)) : ln.quantity)
    } else {
      setEditQty(ln.quantity)
    }
    setEditPrice(ln.unitPrice != null ? normalizeMoneyDecimalStringForApi(String(ln.unitPrice)) : '')
    setEditDesc(ln.description ?? '')
    setEditDiscount(ln.discountAmount ? normalizeMoneyDecimalStringForApi(String(ln.discountAmount)) : '')
    setEditTaxRateId(ln.taxRateId ?? '')
  }

  async function saveEdit() {
    if (!id || !editLine || !canUpdateLine) return
    if (editLine.lineType === 'PART' && !canManageWoPartLines) return
    setMsg(null)
    if (editLine.lineType === 'PART' && editQtyIssue) {
      setMsg(editQtyIssue)
      return
    }
    const editUp = canViewWoFinancials ? normalizeMoneyDecimalStringForApi(editPrice) : ''
    if (canViewWoFinancials && editUp && !API_MONEY_DECIMAL_REGEX.test(editUp)) {
      setMsg('Precio unitario: solo pesos enteros; miles con punto.')
      return
    }
    const editDiscountNorm = canViewWoFinancials && editDiscount.trim()
      ? normalizeMoneyDecimalStringForApi(editDiscount)
      : ''
    if (editDiscountNorm && !API_MONEY_DECIMAL_REGEX.test(editDiscountNorm)) {
      setMsg('Descuento: solo pesos enteros; miles con punto.')
      return
    }
    // null explícito = borrar la tasa anterior; undefined = no tocar; string = setear.
    const taxRatePatch = editTaxRateId === '' ? null : editTaxRateId
    const discountPatch = canViewWoFinancials
      ? editDiscountNorm
        ? editDiscountNorm
        : editDiscount === ''
          ? null
          : undefined
      : undefined

    try {
      const body: Record<string, unknown> = {
        quantity: editQty,
      }
      if (canViewWoFinancials) {
        body.unitPrice = editUp || null
        if (discountPatch !== undefined) body.discountAmount = discountPatch
      }
      if (editLine.lineType === 'LABOR') body.description = editDesc.trim()
      // Solo emitimos taxRateId cuando cambió respecto al valor actual (evita escribir por nada).
      if ((editLine.taxRateId ?? null) !== taxRatePatch) body.taxRateId = taxRatePatch
      await api(`/work-orders/${id}/lines/${editLine.id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      })
      setEditLine(null)
      try {
        await refreshLinesOnWorkOrder()
      } catch {
        await load()
      }
      setMsg('Línea actualizada')
    } catch (e) {
      if (!(await showBlockingConflictModal(e))) {
        setMsg(e instanceof Error ? e.message : 'Error al guardar')
      }
    }
  }

  if (err || !id) {
    return (
      <div className="va-alert-error-block">
        {err ?? 'Orden no válida'}
        <div className="mt-4">
          <Link to="/ordenes" className="text-sm font-medium text-brand-700 underline">
            Volver al listado
          </Link>
        </div>
      </div>
    )
  }

  if (!wo) {
    return <p className="text-slate-500">Cargando…</p>
  }

  const st = STATUS[wo.status]
  const showLineActionsColumn =
    !closed &&
    wo.lines.some((ln) => {
      if (ln.lineType === 'PART') return canEditPartLine || canDeletePartLine
      return Boolean(canUpdateLine || canDeleteLine)
    })
  const linePriceColCount = canViewWoFinancials ? 2 : 0
  const lineTableColSpan = 3 + linePriceColCount + (showLineActionsColumn ? 1 : 0)

  const workshopAssignmentBlock = (helpVariant: 'full' | 'compact') => (
    <Fragment>
      {helpVariant === 'full' ? (
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-300">
          Las órdenes nuevas quedan sin técnico. Al tomarla, pasan a{' '}
          <strong className="font-medium text-slate-700 dark:text-slate-300">Recibida</strong> y quedan asignadas a vos.
          Con permiso de reasignación podés elegir otro técnico abajo o, en esta misma tarjeta, pasar el estado a{' '}
          <strong className="font-medium text-slate-700 dark:text-slate-300">Sin asignar</strong> y guardar para quitar
          al técnico y volver la orden a la cola (solo si la orden no está cerrada).
        </p>
      ) : (
        <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-300">
          Sin técnico queda en cola. <strong className="font-medium text-slate-600 dark:text-slate-300">Tomar</strong> la
          pasa a <strong className="font-medium text-slate-600 dark:text-slate-300">Recibida</strong> a tu nombre. Con
          reasignación podés derivarla; o estado <strong className="font-medium text-slate-600 dark:text-slate-300">
            Sin asignar
          </strong>{' '}
          + guardar arriba.
        </p>
      )}
      <div className="mt-3 text-sm text-slate-700 dark:text-slate-200">
        {wo.assignedTo ? (
          <p>
            <span className="text-slate-500 dark:text-slate-300">Técnico asignado:</span>{' '}
            <span className="font-semibold text-slate-900 dark:text-slate-50">{wo.assignedTo.fullName}</span>
          </p>
        ) : (
          <p className="font-medium text-amber-800 dark:text-amber-200">Sin técnico asignado (en cola del taller)</p>
        )}
      </div>
      {canPatchWo && !closed && !wo.assignedTo && user && (
        <button
          type="button"
          disabled={assignBusy}
          onClick={() => void takeWorkOrder()}
          className="va-btn-primary mt-3 w-full disabled:opacity-50 sm:w-auto"
        >
          {assignBusy ? 'Asignando…' : 'Tomar esta orden (asignarme)'}
        </button>
      )}
      {canPatchWo && !closed && can('work_orders:reassign') && assignableUsers && assignableUsers.length > 0 && (
        <div className="mt-4 flex flex-col gap-2 border-t border-slate-200/80 pt-4 dark:border-slate-600/40 sm:flex-row sm:flex-wrap sm:items-end">
          <label className="block min-w-[12rem] flex-1 text-sm">
            <span className="va-label">Reasignar a otro usuario</span>
            <select
              value={reassignUserId}
              onChange={(e) => setReassignUserId(e.target.value)}
              className="va-field mt-1"
            >
              <option value="">Elegí un usuario…</option>
              {assignableUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName} ({u.email})
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={!reassignUserId || assignBusy}
            onClick={() => void submitReassign()}
            className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-900 disabled:opacity-50 dark:bg-slate-700 dark:hover:bg-slate-600"
          >
            {assignBusy ? 'Guardando…' : 'Aplicar reasignación'}
          </button>
        </div>
      )}
    </Fragment>
  )

  return (
    <div className={detailRootClass}>
      <PageHeader
        beforeTitle={
          <Link to="/ordenes" className={backLinkClass}>
            ← Órdenes
          </Link>
        }
        title={
          <span className="inline-flex flex-wrap items-center gap-2">
            <span>
              Orden {wo.publicCode}{' '}
              <span className="font-mono text-xs font-normal text-slate-400 dark:text-slate-500">
                #{wo.orderNumber}
              </span>
            </span>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${st.tone}`}>{st.label}</span>
          </span>
        }
        description={
          <>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
              {(() => {
                const b = (wo.vehicleBrand ?? wo.vehicle?.brand ?? '').trim()
                if (!b) return null
                return (
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 font-medium text-slate-800 dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-100">
                    Marca: {b}
                  </span>
                )
              })()}
              {(() => {
                const m = (wo.vehicleModel ?? wo.vehicle?.model ?? '').trim()
                if (!m) return null
                return (
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 font-medium text-slate-800 dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-100">
                    Modelo: {m}
                  </span>
                )
              })()}
              {wo.intakeOdometerKm != null ? (
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 font-medium tabular-nums text-slate-800 dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-100">
                  Km ingreso: {wo.intakeOdometerKm.toLocaleString('es-CO')}
                </span>
              ) : null}
              {wo.inspectionOnly ? (
                <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 font-medium text-amber-950 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100">
                  Solo revisión
                </span>
              ) : null}
            </div>
            {cashierOnly ? (
              <p className="mt-2 max-w-3xl text-sm text-slate-500 dark:text-slate-300">
                Vista caja: registrá cobros vinculados a esta orden.
                {(wo.customerName || wo.vehiclePlate) && (
                  <>
                    {' '}
                    <span className="text-slate-600 dark:text-slate-300">
                      {[wo.customerName, wo.vehiclePlate].filter(Boolean).join(' · ')}
                    </span>
                  </>
                )}
              </p>
            ) : hideWorkOrderCashUi ? (
              <div className="mt-2 max-w-3xl space-y-2">
                <p className="text-sm text-slate-500 dark:text-slate-300">
                  Tu perfil no incluye cobros en caja: acá trabajá la orden, el consentimiento y las líneas. Los importes
                  y precios los ve y carga caja o administración.
                </p>
                <p className="text-slate-600 dark:text-slate-300">{wo.description}</p>
              </div>
            ) : (
              <p className="mt-2 max-w-3xl text-slate-600 dark:text-slate-300">{wo.description}</p>
            )}
          </>
        }
      />
      {msg && (
        <p className="va-card-muted" role="status" aria-live="polite">
          {msg}
        </p>
      )}

      {wo.parentWorkOrder ? (
          <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50/90 px-4 py-3 text-sm text-violet-950 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-50">
            <span className="font-semibold">Garantía o seguimiento</span>
            {' · '}
            <Link
              className="font-medium text-violet-800 underline hover:text-violet-900 dark:text-violet-200 dark:hover:text-white"
              to={`/ordenes/${wo.parentWorkOrder.id}`}
            >
              Ver orden origen {wo.parentWorkOrder.publicCode}
            </Link>
          </div>
        ) : null}

        {wo.status === 'DELIVERED' && can('work_orders:create') && !cashierOnly ? (
          <div className="mt-4">
            <Link
              to={`/ordenes?warrantyFrom=${wo.id}`}
              className="inline-flex items-center rounded-xl border border-violet-300 bg-white px-4 py-2 text-sm font-medium text-violet-900 shadow-sm hover:bg-violet-50 dark:border-violet-700 dark:bg-slate-900 dark:text-violet-100 dark:hover:bg-violet-950/50"
            >
              Nueva orden de garantía o seguimiento…
            </Link>
            <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-300">
              Abre el alta de orden vinculada a esta (ya entregada). Mismo vehículo si estaba registrado.
            </p>
          </div>
        ) : null}

        {wo.status === 'DELIVERED' && can('invoices:create') ? (
          <div className="mt-4">
            <button
              type="button"
              onClick={async () => {
                if (invoiceBusy) return
                setInvoiceBusy(true)
                setInvoiceMsg(null)
                try {
                  const res = await api<{ id: string }>(`/invoices/from-work-order/${wo.id}`, {
                    method: 'POST',
                    body: JSON.stringify({}),
                  })
                  navigate(`/facturacion/${res.id}`)
                } catch (err) {
                  setInvoiceMsg(
                    err instanceof ApiError ? err.message : 'No se pudo generar la factura',
                  )
                } finally {
                  setInvoiceBusy(false)
                }
              }}
              disabled={invoiceBusy}
              className="inline-flex items-center rounded-xl bg-sky-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-sky-700 disabled:opacity-60"
              title="Genera factura electrónica DIAN a partir de esta OT (queda en borrador si DIAN está apagado)."
            >
              {invoiceBusy ? 'Generando factura…' : 'Generar factura desde esta OT'}
            </button>
            {invoiceMsg ? (
              <p className="mt-1.5 text-xs text-rose-600 dark:text-rose-300">{invoiceMsg}</p>
            ) : (
              <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-300">
                Crea una factura electrónica (DRAFT) a partir de las líneas de esta orden. Si DIAN está apagado, queda en borrador hasta que se active el proveedor.
              </p>
            )}
          </div>
        ) : null}

        {wo.warrantyFollowUps && wo.warrantyFollowUps.length > 0 ? (
          <div
            className={
              isSaas
                ? 'va-saas-page-section !mt-4 !space-y-0 py-3 sm:py-4'
                : 'mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-600 dark:bg-slate-800/60'
            }
          >
            <p className="va-section-title text-sm">Órdenes de garantía o seguimiento</p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-slate-700 dark:text-slate-200">
              {wo.warrantyFollowUps.map((w) => (
                <li key={w.id}>
                  <Link className="font-medium text-brand-700 underline hover:text-brand-800 dark:text-brand-300" to={`/ordenes/${w.id}`}>
                    OT {w.publicCode}
                  </Link>
                  <span className="text-slate-500 dark:text-slate-300"> — {STATUS[w.status].label}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

      {canPatchWo && (
        <form onSubmit={saveWorkOrder} className={sectionCardClass}>
          <h2 className="va-section-title">Datos de la orden</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block text-sm sm:col-span-2">
              <span className="va-label">Descripción</span>
              <textarea
                required
                minLength={3}
                value={woDesc}
                onChange={(e) => setWoDesc(e.target.value)}
                rows={3}
                className="va-field mt-1"
              />
            </label>
            <label className="block text-sm">
              <span className="va-label">Estado</span>
              <select
                value={woStatus}
                onChange={(e) => setWoStatus(e.target.value as WorkOrderStatus)}
                className="va-field mt-1"
              >
                {selectableStatuses.map((s) => (
                  <option key={s} value={s}>
                    {STATUS[s].label}
                  </option>
                ))}
              </select>
            </label>
            {!hideWorkOrderCashUi && canViewWoFinancials && (
              <label className="block text-sm">
                <span className="va-label">Monto autorizado (tope)</span>
                <input
                  inputMode="decimal"
                  autoComplete="off"
                  value={formatMoneyInputDisplayFromNormalized(normalizeMoneyDecimalStringForApi(woAuth))}
                  onChange={(e) => setWoAuth(normalizeMoneyDecimalStringForApi(e.target.value))}
                  placeholder="Vacío = sin tope"
                  className="va-field mt-1"
                />
              </label>
            )}
            <div className="sm:col-span-2 rounded-xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-900/40">
              <h3 className="va-section-title text-sm">Cliente y vehículo (facturación)</h3>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-300">
                Datos guardados en esta OT para notas y facturación. Si hay vehículo enlazado, al cambiar el vínculo el
                servidor puede copiar nombre, contacto y datos del maestro cuando no enviás esos campos en el mismo
                guardado.
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <label className="block text-sm">
                  <span className="va-label">Nombre del cliente</span>
                  <input
                    value={woCustomerName}
                    onChange={(e) => setWoCustomerName(e.target.value)}
                    maxLength={200}
                    placeholder="Titular / razón social"
                    className="va-field mt-1"
                  />
                </label>
                <label className="block text-sm">
                  <span className="va-label">Correo electrónico</span>
                  <input
                    type="email"
                    autoComplete="email"
                    value={woCustomerEmail}
                    onChange={(e) => setWoCustomerEmail(e.target.value)}
                    maxLength={120}
                    placeholder="Opcional"
                    className="va-field mt-1"
                  />
                </label>
                <label className="block text-sm">
                  <span className="va-label">Teléfono</span>
                  <input
                    value={woCustomerPhone}
                    onChange={(e) => setWoCustomerPhone(e.target.value)}
                    maxLength={80}
                    placeholder="Opcional"
                    className="va-field mt-1"
                  />
                </label>
                <label className="block text-sm">
                  <span className="va-label">Patente</span>
                  <input
                    value={woVehiclePlate}
                    onChange={(e) => setWoVehiclePlate(e.target.value)}
                    maxLength={40}
                    placeholder="Como figura en la OT"
                    className="va-field mt-1"
                  />
                </label>
                <label className="block text-sm">
                  <span className="va-label">Marca (vehículo)</span>
                  <input
                    value={woVehicleBrand}
                    onChange={(e) => setWoVehicleBrand(e.target.value)}
                    maxLength={80}
                    placeholder="Texto libre"
                    className="va-field mt-1"
                  />
                </label>
                <label className="block text-sm">
                  <span className="va-label">Modelo</span>
                  <input
                    value={woVehicleModel}
                    onChange={(e) => setWoVehicleModel(e.target.value)}
                    maxLength={80}
                    placeholder="Opcional"
                    className="va-field mt-1"
                  />
                </label>
                <label className="block text-sm">
                  <span className="va-label">Línea</span>
                  <input
                    value={woVehicleLine}
                    onChange={(e) => setWoVehicleLine(e.target.value)}
                    maxLength={120}
                    placeholder="Opcional (ej. licencia)"
                    className="va-field mt-1"
                  />
                </label>
                <label className="block text-sm">
                  <span className="va-label">Cilindraje (cc)</span>
                  <input
                    value={woVehicleCylinderCc}
                    onChange={(e) => setWoVehicleCylinderCc(e.target.value)}
                    maxLength={32}
                    placeholder="Opcional"
                    className="va-field mt-1"
                  />
                </label>
                <label className="block text-sm">
                  <span className="va-label">Color</span>
                  <input
                    value={woVehicleColor}
                    onChange={(e) => setWoVehicleColor(e.target.value)}
                    maxLength={80}
                    placeholder="Opcional"
                    className="va-field mt-1"
                  />
                </label>
              </div>
              {/* Tres tarjetas alineadas: revisión/consentimiento | OCR | asignación (lg 4+5+3) */}
              <div className="mt-4 grid grid-cols-1 gap-4 border-t border-slate-200/80 pt-4 dark:border-slate-600/40 lg:grid-cols-12 lg:items-stretch lg:gap-4">
                <div className="flex min-h-0 min-w-0 flex-col rounded-2xl border border-slate-200/90 bg-white/60 p-4 shadow-sm dark:border-slate-600/50 dark:bg-slate-900/35 lg:col-span-4">
                  <h3 className="va-section-title text-sm">Revisión y consentimiento</h3>
                  <div className="mt-3 flex min-h-0 flex-1 flex-col gap-4">
                    <label className="block min-w-0 text-sm">
                      <span className="va-label">Kilometraje al ingreso</span>
                      <input
                        inputMode="numeric"
                        value={woIntakeKm}
                        onChange={(e) => setWoIntakeKm(e.target.value.replace(/\D/g, ''))}
                        placeholder="Opcional"
                        className="va-field mt-1 w-full max-w-full"
                      />
                    </label>
                    <label className="flex min-w-0 cursor-pointer items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={woInspectionOnly}
                        onChange={(e) => setWoInspectionOnly(e.target.checked)}
                        className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                      />
                      <span className="min-w-0">
                        <span className="font-medium text-slate-800 dark:text-slate-100">Solo revisión / diagnóstico</span>
                        <span className="mt-0.5 block text-xs font-normal text-slate-500 dark:text-slate-300">
                          El importe al cliente se registra como línea de{' '}
                          <strong className="font-medium">mano de obra</strong> y se cobra con el flujo habitual de la
                          orden (sin campos extra de dinero en la OT).
                        </span>
                      </span>
                    </label>
                    {!cashierOnly && Boolean(wo.clientConsentSignedAt && wo.clientSignaturePngBase64) ? (
                      <div className="mt-auto border-t border-slate-200/70 pt-3 dark:border-slate-600/50">
                        <button
                          type="button"
                          onClick={() => setConsentModal('view')}
                          className={`${FACTURACION_CONSENT_BTN} w-full sm:w-auto`}
                        >
                          Ver consentimiento firmado
                        </button>
                      </div>
                    ) : !cashierOnly && canPatchWo && !closed && !(wo.clientConsentSignedAt && wo.clientSignaturePngBase64) ? (
                      <div className="mt-auto border-t border-slate-200/70 pt-3 dark:border-slate-600/50">
                        <button
                          type="button"
                          onClick={() => setConsentModal('sign')}
                          className={`${FACTURACION_CONSENT_BTN} w-full sm:w-auto`}
                        >
                          Registrar consentimiento…
                        </button>
                      </div>
                    ) : (
                      <div className="mt-auto min-h-0 flex-1" aria-hidden />
                    )}
                  </div>
                </div>
                <div className="flex min-h-0 min-w-0 lg:col-span-5">
                  <TransitLicenseOcrPanel
                    disabled={!canPatchWo || closed}
                    onApply={applyTransitLicenseFromOcr}
                  />
                </div>
                <aside className="flex min-h-0 min-w-0 flex-col rounded-2xl border border-slate-200/90 bg-white/60 p-4 shadow-sm dark:border-slate-600/50 dark:bg-slate-900/35 lg:col-span-3">
                  <h3 className="va-section-title text-sm">Asignación al taller</h3>
                  <div className="mt-3 flex min-h-0 flex-1 flex-col">
                    {workshopAssignmentBlock('compact')}
                  </div>
                </aside>
              </div>
            </div>
          </div>
          <div className="mt-6 border-t border-slate-100 pt-6 dark:border-slate-800">
            <button
              type="submit"
              className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600"
            >
              Guardar orden
            </button>
          </div>
        </form>
      )}

      {!canPatchWo && !cashierOnly && (
        <section className={sectionCardClass}>
          <h2 className="va-section-title">Asignación al taller</h2>
          {workshopAssignmentBlock('full')}
        </section>
      )}

      {!canPatchWo && !cashierOnly && wo.clientConsentSignedAt && wo.clientSignaturePngBase64 ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-900/40">
          <h3 className="va-section-title text-sm">Cliente y vehículo (facturación)</h3>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-300">
            Consentimiento del cliente archivado en esta orden.
          </p>
          <div className="mt-4 flex justify-start">
            <button type="button" onClick={() => setConsentModal('view')} className={FACTURACION_CONSENT_BTN}>
              Ver consentimiento firmado
            </button>
          </div>
        </div>
      ) : null}

      {!hideWorkOrderCashUi && canViewWoFinancials && (
        <div className="grid gap-4 sm:grid-cols-3">
          <div className={financialStatTileClass}>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-300">Subtotal líneas</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-50">${wo.linesSubtotal}</p>
          </div>
          <div className={financialStatTileClass}>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-300">Cobrado</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-50">${wo.paymentSummary.totalPaid}</p>
          </div>
          <div className={financialStatTileClass}>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-300">Saldo pendiente</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-50">${wo.amountDue}</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-300">
              {wo.authorizedAmount != null
                ? 'Según tope autorizado menos cobrado (si hay líneas, el tope manda).'
                : 'Según total de líneas (con IVA/descuento si hubiera) menos cobrado.'}
            </p>
          </div>
        </div>
      )}

      {!hideWorkOrderCashUi && canViewWoFinancials && wo.totals && (
        <WorkOrderTotalsPanel totals={wo.totals} canSeeCosts={canRef.current('reports:read')} />
      )}

      {!cashierOnly && !hideWorkOrderCashUi && (
        <div className="rounded-xl border border-slate-200 bg-slate-50/90 px-4 py-3 text-sm leading-relaxed text-slate-700 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-200">
          <p className="font-semibold text-slate-900 dark:text-slate-50">Cómo encaja esta orden con la caja</p>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-slate-600 dark:text-slate-300">
            <li>
              <strong className="text-slate-800 dark:text-slate-100">El dinero entra en caja</strong> en el momento en que
              alguien registra un cobro en &quot;Cobros en caja&quot; más abajo: se crea un{' '}
              <strong>ingreso en la sesión de caja abierta</strong> y el sistema lo vincula solo a esta orden (referencia
              técnica <span className="font-mono">WorkOrder</span> + id de la OT). No tenés que repetir el ingreso en
              Caja → Ingreso. Para verlo en pantalla: <strong className="text-slate-800 dark:text-slate-100">              Caja → pestaña Movimientos</strong> (listado de la sesión abierta), con enlace a la orden cuando aplica.
            </li>
            <li>
              <strong className="text-slate-800 dark:text-slate-100">Cambiar el estado</strong> de la orden (por ejemplo a
              Lista o Entregada) <strong>no mueve dinero por sí solo</strong>: solo indica en qué etapa está el trabajo en
              el taller.
            </li>
            <li>
              Los <strong>cobros en caja</strong> desde esta pantalla solo se permiten con la orden en{' '}
              <strong>Recibida</strong>, <strong>En taller</strong>, <strong>Esperando repuestos</strong> o{' '}
              <strong>Lista</strong>: no en <strong>Sin asignar</strong>, ni cuando ya está <strong>Entregada</strong> o{' '}
              <strong>Cancelada</strong>.
            </li>
            <li>
              Cada cobro debe marcarse como <strong>abono</strong> (deja saldo; el estado de la orden no cambia) o{' '}
              <strong>pago total</strong> (debe igualar el saldo pendiente; la orden pasa a <strong>Entregada</strong> y no
              se pueden editar montos ni líneas hasta que <strong>administración o dueño</strong> la reabra con{' '}
              <strong>nota y justificación</strong>).
            </li>
            <li>
              Con la orden en <strong>Entregada</strong> o <strong>Cancelada</strong> no se pueden editar líneas. Pasar a
              esos estados por el selector sigue requiriendo permiso de estado terminal; el cierre por pago total ocurre
              solo al elegir pago total en el cobro.
            </li>
          </ul>
        </div>
      )}

      {closed && (
        <>
          <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800/80 dark:bg-amber-950/40 dark:text-amber-100">
            {wo.status === 'CANCELLED'
              ? hideWorkOrderCashUi
                ? 'Orden cancelada: no se pueden editar líneas.'
                : 'Orden cancelada: no se pueden editar líneas ni registrar cobros adicionales.'
              : hideWorkOrderCashUi
                ? 'Orden entregada: no se pueden editar líneas ni montos.'
                : 'Orden entregada: no se pueden editar líneas ni montos; los cobros ya registrados siguieron en caja el día que se cargaron.'}
          </p>
          {canReopenDelivered && (
            <form
              className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900/40 sm:p-5"
              onSubmit={(e) => {
                e.preventDefault()
                void submitReopenDelivered()
              }}
            >
              <h3 className="va-section-title">Reabrir orden entregada</h3>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                Solo administración o dueño. La orden vuelve a <strong>Lista</strong> para permitir correcciones; queda
                registro en auditoría y en notas internas.
              </p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="flex flex-col text-sm">
                  <span className="va-label">Justificación</span>
                  <textarea
                    required
                    rows={4}
                    value={reopenJustification}
                    onChange={(e) => setReopenJustification(e.target.value)}
                    className="va-field mt-1 min-h-[5.5rem] w-full resize-y"
                    placeholder="Motivo operativo o contable de la reapertura…"
                  />
                  <span className="mt-1 text-xs text-slate-500 dark:text-slate-300">{notesMinHint(notesMinGeneral)}</span>
                  <NotesMinCharCounter value={reopenJustification} minLength={notesMinGeneral} />
                </label>
                <label className="flex flex-col text-sm">
                  <span className="va-label">Nota</span>
                  <textarea
                    required
                    rows={4}
                    value={reopenNote}
                    onChange={(e) => setReopenNote(e.target.value)}
                    className="va-field mt-1 min-h-[5.5rem] w-full resize-y"
                    placeholder="Detalle visible en el historial interno de la orden…"
                  />
                  <span className="mt-1 text-xs text-slate-500 dark:text-slate-300">{notesMinHint(notesMinGeneral)}</span>
                  <NotesMinCharCounter value={reopenNote} minLength={notesMinGeneral} />
                </label>
              </div>
              <div className="mt-4">
                <button
                  type="submit"
                  disabled={reopenBusy}
                  className="rounded-xl bg-amber-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-amber-800 disabled:opacity-50 dark:bg-amber-800 dark:hover:bg-amber-700"
                >
                  {reopenBusy ? 'Procesando…' : 'Reabrir a Lista'}
                </button>
              </div>
            </form>
          )}
        </>
      )}

      {showCobrosCajaBlocked && (
        <section className={sectionFlushClass}>
          <div className={sectionHeadClass}>
            <h2 className="va-section-title">Cobros en caja</h2>
            <p className="text-sm text-slate-500 dark:text-slate-300">Ingresos vinculados a esta OT.</p>
          </div>
          <div className="space-y-3 px-4 py-5 sm:px-6">
            {cashOpen === null ? (
              <p className="text-sm text-slate-600 dark:text-slate-300">Consultando estado de caja…</p>
            ) : cashOpenLoadStatus === 'error' ? (
              <>
                <p className="text-sm text-slate-800 dark:text-slate-200">
                  No se pudo verificar si hay sesión abierta. Reintentá o abrí Caja desde el menú.
                </p>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => void refreshCashOpen()}
                    className="rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-900 dark:bg-slate-600 dark:hover:bg-slate-500"
                  >
                    Reintentar
                  </button>
                  <Link
                    to="/caja"
                    className="inline-flex min-h-[44px] items-center text-sm font-medium text-brand-700 underline underline-offset-2 dark:text-brand-300"
                  >
                    Ir a Caja
                  </Link>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-amber-950 dark:text-amber-100">
                  Caja cerrada. No se muestran cobros ni se puede registrar ingreso hasta que haya sesión abierta (política
                  del taller, sin excepciones).
                </p>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => void refreshCashOpen()}
                    className="rounded-xl bg-amber-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-900 dark:bg-amber-700 dark:hover:bg-amber-600"
                  >
                    Actualizar estado
                  </button>
                  <Link
                    to="/caja"
                    className="inline-flex min-h-[44px] items-center text-sm font-medium text-amber-950 underline underline-offset-2 dark:text-amber-50"
                  >
                    Ir a Caja
                  </Link>
                </div>
              </>
            )}
          </div>
        </section>
      )}

      {showCobrosCajaFull && (
      <section ref={paymentsSectionRef} className={sectionFlushClass}>
        <div className={sectionHeadClass}>
          <h2 className="va-section-title">Cobros en caja</h2>
          <p className="text-sm text-slate-500 dark:text-slate-300">Ingresos vinculados a esta OT.</p>
        </div>
        {payFormError && (
          <p
            className="va-alert-error-strip"
            role="alert"
          >
            {payFormError}
          </p>
        )}
        <div className="va-table-scroll">
          <table className="va-table min-w-[480px]">
            <thead>
              <tr className="va-table-head-row">
                <th className="va-table-th">Fecha</th>
                <th className="va-table-th">Tipo</th>
                <th className="va-table-th">Monto</th>
                <th className="va-table-th">Efectivo / vuelto</th>
                <th className="va-table-th">Categoría</th>
                <th className="va-table-th">Registró</th>
              </tr>
            </thead>
            <tbody>
              {payments.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="border-b border-slate-50 px-4 py-8 text-center text-sm text-slate-500 last:border-0 sm:px-6 dark:border-slate-800/80 dark:text-slate-300"
                  >
                    Sin cobros registrados.
                  </td>
                </tr>
              )}
              {payments.map((p) => (
                <tr key={p.id} className="va-table-body-row">
                  <td className="va-table-td font-mono text-xs text-slate-500 dark:text-slate-300">
                    {new Date(p.createdAt).toLocaleString()}
                  </td>
                  <td className="va-table-td text-sm text-slate-700 dark:text-slate-200">
                    {p.kind === 'FULL_SETTLEMENT' ? 'Pago total' : 'Abono'}
                  </td>
                  <td className="va-table-td font-medium tabular-nums text-slate-900 dark:text-slate-50">
                    ${formatCopFromString(p.amount)}
                  </td>
                  <td className="va-table-td text-xs text-slate-600 dark:text-slate-300">
                    {p.cashMovement.tenderAmount != null && p.cashMovement.changeAmount != null
                      ? `Efectivo ${formatCopFromString(p.cashMovement.tenderAmount)} → vuelto ${formatCopFromString(p.cashMovement.changeAmount)}`
                      : '—'}
                  </td>
                  <td className="va-table-td text-slate-600 dark:text-slate-300">{p.cashMovement.category.name}</td>
                  <td className="va-table-td text-slate-600 dark:text-slate-300">{p.recordedBy.fullName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {paymentFormOpen && (
          <form onSubmit={recordPayment} className="border-t border-slate-100 p-4 dark:border-slate-800 sm:p-6">
            {!canSubmitWorkOrderPayment && wo ? (
              <p
                className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950 dark:border-amber-800/80 dark:bg-amber-950/40 dark:text-amber-100"
                role="status"
              >
                {wo.amountDue == null
                  ? 'Tu perfil no recibe el saldo pendiente de esta orden en el sistema; no se puede registrar el cobro desde acá. Pedí a caja o administración.'
                  : !workOrderStatusAllowsPayment
                    ? 'Con la orden en «Sin asignar», Entregada o Cancelada no se registran cobros desde esta pantalla. Pasá la orden a Recibida, En taller, Esperando repuestos o Lista y reintentá.'
                    : 'No se puede registrar el cobro en este momento.'}
              </p>
            ) : null}
            <div className="mb-4 rounded-xl border border-slate-200/90 bg-slate-50/80 p-3.5 dark:border-slate-600 dark:bg-slate-800/50">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-300">Tipo de cobro</p>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-6">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-800 dark:text-slate-100">
                  <input
                    type="radio"
                    name="payKind"
                    checked={payKind === 'partial'}
                    onChange={() => {
                      setPayKind('partial')
                      if (wo) {
                        const due = Number(
                          normalizeMoneyDecimalStringForApi(String(wo.amountDue ?? '')) || wo.amountDue || 0,
                        )
                        const p = Number(normalizeMoneyDecimalStringForApi(payAmt) || 0)
                        if (Number.isFinite(due) && Number.isFinite(p) && p >= due) {
                          setPayAmt('')
                        }
                      }
                    }}
                    className="h-4 w-4 border-slate-300 text-brand-600 dark:border-slate-500"
                  />
                  Abono (deja saldo; no cambia el estado de la orden)
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-800 dark:text-slate-100">
                  <input
                    type="radio"
                    name="payKind"
                    checked={payKind === 'full'}
                    onChange={() => {
                      setPayKind('full')
                      if (wo?.amountDue != null) setPayAmt(normalizeMoneyDecimalStringForApi(wo.amountDue))
                    }}
                    className="h-4 w-4 border-slate-300 text-brand-600 dark:border-slate-500"
                  />
                  Pago total (liquida el saldo; orden pasa a Entregada)
                </label>
              </div>
              {payKind === 'full' && (
                <p className="mt-2 text-xs text-amber-800 dark:text-amber-200/90">
                  El monto se fija al saldo pendiente (${wo.amountDue}). Al confirmar no se podrán editar líneas ni montos
                  hasta una reapertura por administración o dueño.
                </p>
              )}
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-12 sm:items-start sm:gap-x-4 sm:gap-y-0">
              <div className="flex flex-col gap-3 sm:col-span-4">
                <label className="block text-sm">
                  <span className="va-label">Monto del cobro (en caja)</span>
                  <input
                    required
                    inputMode="decimal"
                    autoComplete="off"
                    value={formatMoneyInputDisplayFromNormalized(normalizeMoneyDecimalStringForApi(payAmt))}
                    onChange={(e) => setPayAmt(normalizeMoneyDecimalStringForApi(e.target.value))}
                    readOnly={payKind === 'full'}
                    className={`va-field mt-1 w-full ${payKind === 'full' ? 'cursor-not-allowed bg-slate-100 dark:bg-slate-800/80' : ''}`}
                  />
                </label>
                <label className="block text-sm">
                  <span className="va-label">Efectivo que entrega el cliente (opcional)</span>
                  <input
                    inputMode="decimal"
                    autoComplete="off"
                    value={formatMoneyInputDisplayFromNormalized(normalizeMoneyDecimalStringForApi(payTender))}
                    onChange={(e) => setPayTender(normalizeMoneyDecimalStringForApi(e.target.value))}
                    className="va-field mt-1 w-full"
                    placeholder="Ej. 100.000 si paga con billete mayor"
                  />
                  {payVueltoHint && (
                    <p className="mt-2 rounded-lg border border-brand-200 bg-brand-50 px-2.5 py-2 text-xs font-medium text-brand-900 dark:border-brand-600 dark:bg-brand-900/70 dark:text-brand-50">
                      {payVueltoHint}
                    </p>
                  )}
                </label>
                <label className="block text-sm">
                  <span className="va-label">Categoría</span>
                  <select value={payCat} onChange={(e) => setPayCat(e.target.value)} className="va-field mt-1 w-full">
                    {incomeCats.map((c) => (
                      <option key={c.slug} value={c.slug}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="flex flex-col text-sm sm:col-span-8">
                <span className="va-label">Nota del cobro</span>
                <textarea
                  required
                  rows={4}
                  value={payNote}
                  onChange={(e) => setPayNote(e.target.value)}
                  className="va-field mt-1 min-h-[6.75rem] w-full resize-y sm:min-h-[7.25rem]"
                  placeholder="Ej. anticipo cliente, cobro final según presupuesto aprobado…"
                />
                <span className="mt-1.5 text-xs leading-snug text-slate-500 dark:text-slate-300">
                  {notesMinHint(notesMinPayment)}
                </span>
                <NotesMinCharCounter value={payNote} minLength={notesMinPayment} />
              </label>
            </div>
            <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 dark:border-slate-800 sm:mt-5 sm:flex-row sm:items-center sm:justify-between sm:pt-5">
              <label className="flex cursor-pointer items-start gap-2.5 text-sm text-slate-700 dark:text-slate-300 sm:max-w-xl sm:pr-4">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-brand-600 dark:border-slate-500"
                  checked={payAck}
                  onChange={(e) => setPayAck(e.target.checked)}
                />
                <span className="leading-snug">
                  Confirmo que revisé tipo de cobro (abono o pago total), monto, efectivo recibido (si aplica), categoría,
                  nota y saldo pendiente antes de registrar el cobro.
                </span>
              </label>
              <button
                type="submit"
                disabled={paymentBusy || !canSubmitWorkOrderPayment}
                className="va-btn-primary w-full shrink-0 px-5 disabled:opacity-60 sm:w-auto sm:self-center"
              >
                {paymentBusy ? 'Procesando…' : 'Registrar cobro'}
              </button>
            </div>
          </form>
        )}
      </section>
      )}

      <section className={sectionFlushClass}>
        <div className={sectionHeadClass}>
          <h2 className="va-section-title">Líneas</h2>
          <p className="text-sm text-slate-500 dark:text-slate-300">Repuestos (stock) y mano de obra.</p>
        </div>
        <div className="va-table-scroll">
          <table
            className={`va-table ${showLineActionsColumn || linePriceColCount ? 'min-w-[640px]' : 'min-w-[480px]'}`}
          >
            <thead>
              <tr className="va-table-head-row">
                <th className="va-table-th">Tipo</th>
                <th className="va-table-th">Detalle</th>
                <th className="va-table-th">Cant.</th>
                {canViewWoFinancials ? (
                  <>
                    <th className="va-table-th">P. unit.</th>
                    <th className="va-table-th">Importe</th>
                  </>
                ) : null}
                {showLineActionsColumn ? <th className="va-table-th" /> : null}
              </tr>
            </thead>
            <tbody>
              {wo.lines.length === 0 && (
                <tr>
                  <td
                    colSpan={lineTableColSpan}
                    className="border-b border-slate-50 px-4 py-8 text-center text-slate-500 last:border-0 sm:px-6 dark:border-slate-800/80 dark:text-slate-300"
                  >
                    Sin líneas aún.
                  </td>
                </tr>
              )}
              {wo.lines.map((ln) => (
                <tr key={ln.id} className="va-table-body-row">
                  <td className="va-table-td">
                    <span
                      className={
                        ln.lineType === 'PART'
                          ? 'rounded-md bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-800 dark:bg-violet-900/75 dark:text-violet-50'
                          : 'rounded-md bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-800 dark:bg-teal-900/75 dark:text-teal-50'
                      }
                    >
                      {ln.lineType === 'PART' ? 'Repuesto' : 'Mano de obra'}
                    </span>
                  </td>
                  <td className="va-table-td min-w-0 max-w-xs text-slate-700 dark:text-slate-300">
                    {ln.lineType === 'PART' ? (
                      <span className="line-clamp-2">
                        {ln.inventoryItem
                          ? workOrderPartDisplayText(ln.inventoryItem)
                          : ln.inventoryItemId}
                      </span>
                    ) : (
                      <span className="line-clamp-2">{ln.description ?? '—'}</span>
                    )}
                  </td>
                  <td className="va-table-td font-mono text-slate-800 dark:text-slate-200">
                    {ln.lineType === 'PART' && ln.inventoryItem
                      ? partLineQuantityDisplayWithQuarters(ln.quantity, ln.inventoryItem)
                      : ln.quantity}
                  </td>
                  {canViewWoFinancials ? (
                    <>
                      <td className="va-table-td font-mono text-slate-600 dark:text-slate-300">
                        {ln.unitPrice != null ? `$${formatCopFromString(String(ln.unitPrice))}` : '—'}
                        {ln.discountAmount && Number(ln.discountAmount) > 0 ? (
                          <span className="ml-1 text-[10px] text-amber-700 dark:text-amber-300">
                            −${formatCopFromString(String(ln.discountAmount))}
                          </span>
                        ) : null}
                        {ln.taxRatePercentSnapshot && Number(ln.taxRatePercentSnapshot) > 0 ? (
                          <span className="ml-1 text-[10px] text-slate-500 dark:text-slate-400">
                            +{Number(ln.taxRatePercentSnapshot).toString()}%
                          </span>
                        ) : null}
                      </td>
                      <td className="va-table-td font-medium tabular-nums text-slate-900 dark:text-slate-50">
                        {ln.totals
                          ? `$${formatCopFromString(ln.totals.lineTotal)}`
                          : lineMoney(ln) === '—'
                            ? '—'
                            : `$${formatCopFromString(lineMoney(ln))}`}
                      </td>
                    </>
                  ) : null}
                  {showLineActionsColumn ? (
                    <td className="va-table-td">
                      <div className="flex flex-wrap gap-2">
                        {(ln.lineType === 'PART' ? canEditPartLine : canUpdateLine) ? (
                          <button
                            type="button"
                            onClick={() => startEdit(ln)}
                            className="text-xs font-medium text-brand-700 hover:underline dark:text-brand-300"
                          >
                            Editar
                          </button>
                        ) : null}
                        {(ln.lineType === 'PART' ? canDeletePartLine : canDeleteLine) ? (
                          <button
                            type="button"
                            onClick={() => void removeLine(ln.id)}
                            className="text-xs font-medium text-red-600 hover:underline dark:text-red-400"
                          >
                            Quitar
                          </button>
                        ) : null}
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {editLine && (editLine.lineType === 'PART' ? canEditPartLine : canUpdateLine) ? (
        <div className="rounded-2xl border border-brand-200 bg-brand-50/40 p-4 dark:border-brand-800/60 dark:bg-brand-900/35 sm:p-6">
          <h3 className="va-section-title text-sm">Editar línea</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="va-label">
                  {editLine.lineType === 'PART' &&
                  editLine.inventoryItem &&
                  inventoryItemUsesQuarterGallonOtQuantity(editLine.inventoryItem)
                    ? 'Cantidad (1 = ¼ gal)'
                    : 'Cantidad'}
                </span>
                <input
                  value={editQty}
                  onChange={(e) => setEditQty(e.target.value)}
                  className="va-field mt-1"
                  step={
                    editLine.lineType === 'PART' &&
                    editLine.inventoryItem &&
                    inventoryItemUsesQuarterGallonOtQuantity(editLine.inventoryItem)
                      ? 1
                      : editLine.lineType === 'PART' &&
                          editLine.inventoryItem &&
                          allowsFractionalWorkOrderPartQuantity(editLine.inventoryItem.measurementUnit.slug)
                        ? 'any'
                        : '1'
                  }
                  min={0}
                  inputMode="decimal"
                />
                {editQtyIssue ? (
                  <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">{editQtyIssue}</p>
                ) : null}
              </label>
            {canViewWoFinancials ? (
              <label className="block text-sm">
                <span className="va-label">Precio unitario</span>
                <input
                  inputMode="decimal"
                  autoComplete="off"
                  value={formatMoneyInputDisplayFromNormalized(normalizeMoneyDecimalStringForApi(editPrice))}
                  onChange={(e) => setEditPrice(normalizeMoneyDecimalStringForApi(e.target.value))}
                  className="va-field mt-1"
                  placeholder="Opcional"
                />
              </label>
            ) : (
              <p className="block text-sm text-slate-500 dark:text-slate-300">
                Precio unitario: tu perfil no muestra importes en la orden; lo cargan caja o administración.
              </p>
            )}
            {editLine.lineType === 'LABOR' && (
              <label className="block text-sm sm:col-span-2">
                <span className="va-label">Descripción</span>
                <input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} className="va-field mt-1" />
              </label>
            )}
            {canViewWoFinancials && taxRatesCatalog.length > 0 ? (
              <label className="block text-sm">
                <span className="va-label">Impuesto (opcional)</span>
                <select
                  value={editTaxRateId}
                  onChange={(e) => setEditTaxRateId(e.target.value)}
                  className="va-field mt-1"
                >
                  <option value="">— Sin impuesto —</option>
                  {taxRatesCatalog.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.kind})
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {canViewWoFinancials ? (
              <label className="block text-sm">
                <span className="va-label">Descuento COP (opcional)</span>
                <input
                  inputMode="decimal"
                  autoComplete="off"
                  value={formatMoneyInputDisplayFromNormalized(normalizeMoneyDecimalStringForApi(editDiscount))}
                  onChange={(e) => setEditDiscount(normalizeMoneyDecimalStringForApi(e.target.value))}
                  className="va-field mt-1"
                  placeholder="ej. 5.000"
                />
              </label>
            ) : null}
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => void saveEdit()}
              disabled={editLine.lineType === 'PART' && !!editQtyIssue}
              className="va-btn-primary disabled:opacity-50"
            >
              Guardar
            </button>
            <button
              type="button"
              onClick={() => setEditLine(null)}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : null}

      {canMutateLines && (
        <section className={sectionCardClass}>
          <h2 className="va-section-title">Agregar línea</h2>
          <div className="va-tabstrip mt-3 max-w-md">
            <button
              type="button"
              role="tab"
              aria-selected={addKind === 'PART'}
              onClick={() => setAddKind('PART')}
              className={`va-tab ${addKind === 'PART' ? 'va-tab-active' : 'va-tab-inactive'}`}
            >
              Repuesto
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={addKind === 'LABOR'}
              disabled={hasLaborLine}
              title={
                hasLaborLine
                  ? 'Ya hay una mano de obra en esta orden. Editá o quitá la línea en la tabla de arriba para agregar otra.'
                  : undefined
              }
              onClick={() => {
                if (hasLaborLine) return
                setAddKind('LABOR')
              }}
              className={`va-tab ${addKind === 'LABOR' ? 'va-tab-active' : 'va-tab-inactive'} ${
                hasLaborLine ? 'cursor-not-allowed opacity-50' : ''
              }`}
            >
              Mano de obra
            </button>
          </div>
          {hasLaborLine && (
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-300">
              Solo una mano de obra por orden. Con la pestaña deshabilitada podés seguir agregando repuestos.
            </p>
          )}

          {addKind === 'PART' || hasLaborLine ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <label className="block text-sm sm:col-span-2">
                <span className="va-label">Ítem</span>
                <select value={partItemId} onChange={(e) => setPartItemId(e.target.value)} className="va-field mt-1">
                  <option value="">Elegí repuesto…</option>
                  {partOptions}
                </select>
              </label>
              <label className="block text-sm">
                <span className="va-label">
                  {selectedPartItem && inventoryItemUsesQuarterGallonOtQuantity(selectedPartItem)
                    ? 'Cantidad (1 = ¼ gal)'
                    : 'Cantidad'}
                </span>
                <input
                  value={partQty}
                  onChange={(e) => setPartQty(e.target.value)}
                  className="va-field mt-1"
                  step={
                    selectedPartItem && inventoryItemUsesQuarterGallonOtQuantity(selectedPartItem)
                      ? 1
                      : selectedPartItem &&
                          allowsFractionalWorkOrderPartQuantity(selectedPartItem.measurementUnit.slug)
                        ? 'any'
                        : '1'
                  }
                  min={0}
                  inputMode="decimal"
                />
                {partQtyIssue ? (
                  <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">{partQtyIssue}</p>
                ) : null}
              </label>
              {canViewWoFinancials ? (
                <label className="block text-sm sm:col-span-3">
                  <span className="va-label">Precio al cliente (opcional)</span>
                  <input
                    inputMode="decimal"
                    autoComplete="off"
                    value={formatMoneyInputDisplayFromNormalized(normalizeMoneyDecimalStringForApi(partPrice))}
                    onChange={(e) => setPartPrice(normalizeMoneyDecimalStringForApi(e.target.value))}
                    className="va-field mt-1 max-w-xs"
                    placeholder="ej. 25.000 o 25.000,50"
                  />
                </label>
              ) : (
                <p className="text-sm text-slate-500 sm:col-span-3 dark:text-slate-300">
                  Precio al cliente: lo cargan caja o administración.
                </p>
              )}
            </div>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block text-sm sm:col-span-2">
                <span className="va-label">Descripción del trabajo</span>
                <input
                  value={laborDesc}
                  onChange={(e) => setLaborDesc(e.target.value)}
                  className="va-field mt-1"
                  placeholder="ej. Cambio de aceite y filtro"
                />
              </label>
              <label className="block text-sm">
                <span className="va-label">Cantidad (horas o unidad)</span>
                <input value={laborQty} onChange={(e) => setLaborQty(e.target.value)} className="va-field mt-1" />
              </label>
              {canViewWoFinancials ? (
                <label className="block text-sm">
                  <span className="va-label">Precio (opcional)</span>
                  <input
                    inputMode="decimal"
                    autoComplete="off"
                    value={formatMoneyInputDisplayFromNormalized(normalizeMoneyDecimalStringForApi(laborPrice))}
                    onChange={(e) => setLaborPrice(normalizeMoneyDecimalStringForApi(e.target.value))}
                    className="va-field mt-1"
                  />
                </label>
              ) : (
                <p className="block text-sm text-slate-500 dark:text-slate-300">
                  Precio mano de obra: lo cargan caja o administración.
                </p>
              )}
            </div>
          )}

          {(servicesCatalog.length > 0 || taxRatesCatalog.length > 0) && canViewWoFinancials ? (
            <div className="mt-4">
              <button
                type="button"
                onClick={() => setShowFiscalOptions((v) => !v)}
                className="text-xs font-medium text-slate-600 underline underline-offset-4 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100"
              >
                {showFiscalOptions ? 'Ocultar opciones fiscales' : 'Opciones fiscales (servicio del catálogo, IVA, descuento)'}
              </button>
              {showFiscalOptions ? (
                <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-700 dark:bg-slate-800/40">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Se completan solo si los necesitás: como persona natural podés dejarlos vacíos (sin IVA ni descuento).
                  </p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    {addKind === 'LABOR' && !hasLaborLine && servicesCatalog.length > 0 ? (
                      <label className="block text-sm sm:col-span-3">
                        <span className="va-label">Servicio del catálogo (opcional)</span>
                        <select
                          value={laborServiceId}
                          onChange={(e) => {
                            const next = e.target.value
                            setLaborServiceId(next)
                            if (next) {
                              const svc = servicesCatalog.find((s) => s.id === next)
                              if (svc?.defaultUnitPrice && !laborPrice.trim()) {
                                setLaborPrice(normalizeMoneyDecimalStringForApi(svc.defaultUnitPrice))
                              }
                              if (svc?.defaultTaxRateId && !laborTaxRateId) {
                                setLaborTaxRateId(svc.defaultTaxRateId)
                              }
                              if (svc?.name && !laborDesc.trim()) setLaborDesc(svc.name)
                            }
                          }}
                          className="va-field mt-1"
                        >
                          <option value="">— Sin servicio del catálogo —</option>
                          {servicesCatalog.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.code} · {s.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    {taxRatesCatalog.length > 0 ? (
                      <label className="block text-sm">
                        <span className="va-label">Impuesto (opcional)</span>
                        <select
                          value={addKind === 'PART' || hasLaborLine ? partTaxRateId : laborTaxRateId}
                          onChange={(e) =>
                            addKind === 'PART' || hasLaborLine
                              ? setPartTaxRateId(e.target.value)
                              : setLaborTaxRateId(e.target.value)
                          }
                          className="va-field mt-1"
                        >
                          <option value="">— Sin impuesto —</option>
                          {taxRatesCatalog.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name} ({t.kind})
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    <label className="block text-sm">
                      <span className="va-label">Descuento COP (opcional)</span>
                      <input
                        inputMode="decimal"
                        autoComplete="off"
                        value={formatMoneyInputDisplayFromNormalized(
                          normalizeMoneyDecimalStringForApi(
                            addKind === 'PART' || hasLaborLine ? partDiscount : laborDiscount,
                          ),
                        )}
                        onChange={(e) => {
                          const next = normalizeMoneyDecimalStringForApi(e.target.value)
                          if (addKind === 'PART' || hasLaborLine) setPartDiscount(next)
                          else setLaborDiscount(next)
                        }}
                        className="va-field mt-1"
                        placeholder="ej. 5.000"
                      />
                    </label>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => void addLine()}
            disabled={
              addKind === 'PART' || hasLaborLine
                ? !partItemId || !!partQtyIssue
                : laborDesc.trim().length < 3 && !laborServiceId
            }
            className="va-btn-primary mt-6 px-5 disabled:opacity-50"
          >
            Agregar a la orden
          </button>
        </section>
      )}

      {consentModal === 'view' && wo.clientConsentSignedAt && wo.clientSignaturePngBase64 ? (
        <ClientConsentSignedModal
          orderNumber={wo.orderNumber}
          publicCode={wo.publicCode}
          signedAt={wo.clientConsentSignedAt}
          consentSnapshot={wo.clientConsentTextSnapshot ?? null}
          signaturePngBase64={wo.clientSignaturePngBase64}
          onClose={() => setConsentModal(null)}
        />
      ) : null}
      {consentModal === 'sign' && canPatchWo && !closed ? (
        <ClientConsentSignModal
          workOrderId={wo.id}
          orderNumber={wo.orderNumber}
          publicCode={wo.publicCode}
          onRecorded={() => void load()}
          onClose={() => setConsentModal(null)}
        />
      ) : null}
    </div>
  )
}
