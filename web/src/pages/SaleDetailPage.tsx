import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, ApiError, openAuthenticatedHtml } from '../api/client'
import type {
  CreateSaleLinePayload,
  InventoryItem,
  RecordSalePaymentPayload,
  SaleDetail,
  SaleLineType,
  SaleStatus,
  Service,
  TaxRate,
} from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { portalPath } from '../constants/portalPath'
import { useConfirm } from '../components/confirm/ConfirmProvider'
import { PageHeader } from '../components/layout/PageHeader'
import { formatCopFromString, normalizeMoneyDecimalStringForApi } from '../utils/copFormat'
import {
  printTicketFromApi,
  successMessageWithTicketAndPulse,
} from '../utils/cashDrawerBridge'

type CashCategory = { id: string; slug: string; name: string; direction: string }

const STATUS_LABEL: Record<SaleStatus, string> = {
  DRAFT: 'Borrador',
  CONFIRMED: 'Confirmada',
  CANCELLED: 'Anulada',
}

function StatusBadge({ status }: { status: SaleStatus }) {
  const tone =
    status === 'CONFIRMED'
      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
      : status === 'CANCELLED'
        ? 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200'
        : 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-200'
  return (
    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${tone}`}>
      {STATUS_LABEL[status]}
    </span>
  )
}

type AddLineDraft = {
  kind: SaleLineType
  inventoryItemId: string
  serviceId: string
  description: string
  quantity: string
  unitPrice: string
  discountAmount: string
  taxRateId: string
}

const EMPTY_LINE: AddLineDraft = {
  kind: 'PART',
  inventoryItemId: '',
  serviceId: '',
  description: '',
  quantity: '1',
  unitPrice: '',
  discountAmount: '',
  taxRateId: '',
}

export function SaleDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { can } = useAuth()
  const confirmDlg = useConfirm()

  const [sale, setSale] = useState<SaleDetail | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [items, setItems] = useState<InventoryItem[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [taxRates, setTaxRates] = useState<TaxRate[]>([])
  const [incomeCats, setIncomeCats] = useState<CashCategory[]>([])

  const [lineDraft, setLineDraft] = useState<AddLineDraft>(EMPTY_LINE)
  const [lineBusy, setLineBusy] = useState(false)
  const [lineMsg, setLineMsg] = useState<string | null>(null)

  const [confirmBusy, setConfirmBusy] = useState(false)
  const [cancelBusy, setCancelBusy] = useState(false)
  const [cancelReason, setCancelReason] = useState('')

  const [payKind, setPayKind] = useState<'partial' | 'full'>('partial')
  const [payAmt, setPayAmt] = useState('')
  const [payNote, setPayNote] = useState('')
  const [payCat, setPayCat] = useState<string>('ingreso_cobro')
  const [payTender, setPayTender] = useState('')
  const [payBusy, setPayBusy] = useState(false)
  const [payMsg, setPayMsg] = useState<string | null>(null)
  const [payTwoCopies, setPayTwoCopies] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    try {
      setLoading(true)
      const res = await api<SaleDetail>(`/sales/${id}`)
      setSale(res)
      setMsg(null)
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : 'No se pudo cargar la venta')
      setSale(null)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!can('inventory_items:read')) return
    void api<InventoryItem[]>('/inventory/items')
      .then((list) => setItems(list.filter((i) => i.isActive)))
      .catch(() => undefined)
  }, [can])

  useEffect(() => {
    if (!can('services:read')) return
    void api<{ items: Service[] }>('/services?activeOnly=true')
      .then((r) => setServices(Array.isArray(r.items) ? r.items : []))
      .catch(() => undefined)
  }, [can])

  useEffect(() => {
    if (!can('tax_rates:read')) return
    void api<{ items: TaxRate[] }>('/tax-rates?activeOnly=true')
      .then((r) => setTaxRates(Array.isArray(r.items) ? r.items : []))
      .catch(() => undefined)
  }, [can])

  useEffect(() => {
    if (!can('cash_movements:create_income')) return
    void api<CashCategory[]>('/cash/categories')
      .then((list) => {
        const inc = list.filter((c) => c.direction === 'INCOME')
        setIncomeCats(inc)
        setPayCat((prev) => (inc.some((c) => c.slug === prev) ? prev : inc[0]?.slug ?? 'ingreso_cobro'))
      })
      .catch(() => undefined)
  }, [can])

  useEffect(() => {
    if (sale && payKind === 'full' && sale.amountDue) {
      setPayAmt(normalizeMoneyDecimalStringForApi(sale.amountDue))
    }
  }, [sale?.id, sale?.amountDue, payKind])

  const isDraft = sale?.status === 'DRAFT'
  const isConfirmed = sale?.status === 'CONFIRMED'
  const isCancelled = sale?.status === 'CANCELLED'
  const fromWorkOrder = sale?.origin === 'WORK_ORDER'

  const canEditLines = Boolean(
    sale && isDraft && !fromWorkOrder && can('sale_lines:create'),
  )
  const canDeleteLines = Boolean(
    sale && isDraft && !fromWorkOrder && can('sale_lines:delete'),
  )
  const canConfirm = Boolean(sale && isDraft && can('sales:confirm'))
  const canCancel = Boolean(sale && !isCancelled && can('sales:cancel'))
  const canRecordPayment = Boolean(
    sale &&
      isConfirmed &&
      sale.amountDue &&
      Number(sale.amountDue) > 0 &&
      can('sales:record_payment') &&
      can('cash_movements:create_income'),
  )
  const canCreateInvoice = Boolean(sale && isConfirmed && can('invoices:create'))

  const selectedItem = useMemo(
    () => items.find((i) => i.id === lineDraft.inventoryItemId) ?? null,
    [items, lineDraft.inventoryItemId],
  )
  const selectedService = useMemo(
    () => services.find((s) => s.id === lineDraft.serviceId) ?? null,
    [services, lineDraft.serviceId],
  )

  useEffect(() => {
    if (selectedService && lineDraft.kind === 'LABOR') {
      setLineDraft((d) => ({
        ...d,
        description: d.description || selectedService.name,
        unitPrice: d.unitPrice || (selectedService.defaultUnitPrice ?? ''),
        taxRateId: d.taxRateId || (selectedService.defaultTaxRateId ?? ''),
      }))
    }
  }, [selectedService?.id])

  async function onSubmitLine(e: React.FormEvent) {
    e.preventDefault()
    if (!sale || lineBusy) return
    setLineBusy(true)
    setLineMsg(null)
    try {
      const payload: CreateSaleLinePayload = {
        lineType: lineDraft.kind,
        quantity: lineDraft.quantity.trim(),
      }
      if (lineDraft.kind === 'PART') {
        if (!lineDraft.inventoryItemId) throw new Error('Selecciona un repuesto/insumo')
        payload.inventoryItemId = lineDraft.inventoryItemId
      } else {
        if (!lineDraft.description.trim()) throw new Error('Describe el servicio')
        payload.description = lineDraft.description.trim()
        if (lineDraft.serviceId) payload.serviceId = lineDraft.serviceId
      }
      if (lineDraft.unitPrice.trim()) {
        payload.unitPrice = normalizeMoneyDecimalStringForApi(lineDraft.unitPrice)
      }
      if (lineDraft.discountAmount.trim()) {
        payload.discountAmount = normalizeMoneyDecimalStringForApi(lineDraft.discountAmount)
      }
      if (lineDraft.taxRateId) payload.taxRateId = lineDraft.taxRateId

      await api(`/sales/${sale.id}/lines`, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      setLineDraft(EMPTY_LINE)
      await load()
    } catch (err) {
      setLineMsg(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'No se pudo agregar la línea',
      )
    } finally {
      setLineBusy(false)
    }
  }

  async function onDeleteLine(lineId: string) {
    if (!sale) return
    const ok = await confirmDlg({
      title: 'Eliminar línea',
      message: '¿Eliminar esta línea de la venta?',
      variant: 'danger',
      confirmLabel: 'Eliminar',
    })
    if (!ok) return
    try {
      await api(`/sales/${sale.id}/lines/${lineId}`, { method: 'DELETE' })
      await load()
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : 'No se pudo eliminar la línea')
    }
  }

  async function onConfirm() {
    if (!sale || confirmBusy) return
    const ok = await confirmDlg({
      title: 'Confirmar venta',
      message:
        'Al confirmar la venta se descontará el inventario de los repuestos según las líneas cargadas. ¿Continuar?',
      confirmLabel: 'Confirmar venta',
    })
    if (!ok) return
    setConfirmBusy(true)
    try {
      await api(`/sales/${sale.id}/confirm`, { method: 'POST' })
      await load()
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : 'No se pudo confirmar la venta')
    } finally {
      setConfirmBusy(false)
    }
  }

  async function onCancel() {
    if (!sale || cancelBusy) return
    if (cancelReason.trim().length < 5) {
      setMsg('Describe el motivo de anulación (al menos 5 caracteres).')
      return
    }
    const okCancel = await confirmDlg({
      title: 'Anular venta',
      message: '¿Anular la venta? Se reintegrará el inventario de repuestos si aplica.',
      variant: 'danger',
      confirmLabel: 'Anular venta',
    })
    if (!okCancel) return
    setCancelBusy(true)
    try {
      await api(`/sales/${sale.id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason: cancelReason.trim() }),
      })
      await load()
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : 'No se pudo anular la venta')
    } finally {
      setCancelBusy(false)
    }
  }

  const [invoiceBusy, setInvoiceBusy] = useState(false)
  async function onCreateInvoice() {
    if (!sale || invoiceBusy) return
    setInvoiceBusy(true)
    setMsg(null)
    try {
      const res = await api<{ id: string }>(`/invoices/from-sale/${sale.id}`, {
        method: 'POST',
        body: JSON.stringify({}),
      })
      navigate(portalPath(`/facturacion/${res.id}`))
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : 'No se pudo generar la factura')
    } finally {
      setInvoiceBusy(false)
    }
  }

  async function onRecordPayment(e: React.FormEvent) {
    e.preventDefault()
    if (!sale || payBusy) return
    setPayBusy(true)
    setPayMsg(null)
    try {
      const payload: RecordSalePaymentPayload = {
        paymentKind: payKind,
        amount: normalizeMoneyDecimalStringForApi(payAmt),
        note: payNote.trim(),
        categorySlug: payCat || undefined,
      }
      if (payTender.trim()) payload.tenderAmount = normalizeMoneyDecimalStringForApi(payTender)
      /**
       * Fase 7.7 · Capturamos el id del cobro para imprimir ticket térmico (58 mm, ESC/POS)
       * desde el puente local y, en el mismo viaje, abrir el cajón. Si se marcó "2 copias",
       * se envía copies=2 al puente.
       */
      const created = await api<{ id: string }>(`/sales/${sale.id}/payments`, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      setPayAmt('')
      setPayNote('')
      setPayTender('')
      const ticketPath = `/sales/${sale.id}/payments/${created.id}/receipt-ticket.json`
      setPayMsg(
        await successMessageWithTicketAndPulse(ticketPath, 'Cobro registrado', {
          copies: payTwoCopies ? 2 : 1,
          openDrawer: true,
        }),
      )
      setPayTwoCopies(false)
      await load()
    } catch (err) {
      setPayMsg(err instanceof ApiError ? err.message : 'No se pudo registrar el cobro')
    } finally {
      setPayBusy(false)
    }
  }

  if (loading && !sale) {
    return <div className="p-4 text-sm text-slate-500">Cargando venta…</div>
  }
  if (!sale) {
    return (
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => navigate(portalPath('/ventas'))}
          className="text-sm text-brand-700 hover:underline dark:text-brand-300"
        >
          ← Volver a ventas
        </button>
        {msg ? (
          <div className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-700 dark:bg-rose-900/30 dark:text-rose-200">
            {msg}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Venta ${sale.publicCode}`}
        description={
          <span className="inline-flex items-center gap-2">
            <StatusBadge status={sale.status} />
            <span className="text-slate-500 dark:text-slate-400">
              {sale.origin === 'WORK_ORDER'
                ? 'Originada desde orden de trabajo'
                : 'Venta de mostrador'}
            </span>
            {sale.originWorkOrder ? (
              <Link
                to={portalPath(`/ordenes/${sale.originWorkOrder.id}`)}
                className="text-xs text-brand-700 hover:underline dark:text-brand-300"
              >
                (OT {sale.originWorkOrder.publicCode})
              </Link>
            ) : null}
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                void openAuthenticatedHtml(
                  `/sales/${sale.id}/receipt?autoprint=1`,
                  `Recibo venta ${sale.publicCode}`,
                ).catch((err) => {
                  setMsg(
                    err instanceof Error
                      ? err.message
                      : 'No se pudo abrir el comprobante',
                  )
                })
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
              title="Abrir comprobante interno imprimible (no es factura electrónica)"
            >
              Imprimir comprobante
            </button>
            <Link
              to={portalPath('/ventas')}
              className="text-sm text-brand-700 hover:underline dark:text-brand-300"
            >
              ← Volver
            </Link>
          </div>
        }
      />

      {msg ? (
        <div className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-700 dark:bg-rose-900/30 dark:text-rose-200">
          {msg}
        </div>
      ) : null}

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">Cliente</h3>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <dt className="text-slate-500 dark:text-slate-400">Nombre</dt>
            <dd>{sale.customer?.displayName ?? sale.customerName ?? '—'}</dd>
            <dt className="text-slate-500 dark:text-slate-400">Documento</dt>
            <dd>{sale.customerDocumentId ?? '—'}</dd>
            <dt className="text-slate-500 dark:text-slate-400">Teléfono</dt>
            <dd>{sale.customerPhone ?? '—'}</dd>
            <dt className="text-slate-500 dark:text-slate-400">Correo</dt>
            <dd>{sale.customerEmail ?? '—'}</dd>
          </dl>
          {sale.internalNotes ? (
            <div className="mt-3 rounded-lg bg-slate-50 p-2 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              <span className="font-semibold">Notas internas: </span>
              {sale.internalNotes}
            </div>
          ) : null}
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">Totales</h3>
          {sale.totals ? (
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500 dark:text-slate-400">Subtotal</dt>
                <dd>{formatCopFromString(sale.totals.linesSubtotal ?? '0')}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500 dark:text-slate-400">Descuento</dt>
                <dd>- {formatCopFromString(sale.totals.totalDiscount ?? '0')}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500 dark:text-slate-400">Impuestos</dt>
                <dd>{formatCopFromString(sale.totals.totalTax ?? '0')}</dd>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-1 font-semibold dark:border-slate-700">
                <dt>Total</dt>
                <dd>{formatCopFromString(sale.totals.grandTotal ?? '0')}</dd>
              </div>
              <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
                <dt>Cobrado</dt>
                <dd>{formatCopFromString(sale.paymentSummary.totalPaid ?? '0')}</dd>
              </div>
              <div className="flex justify-between text-xs font-semibold text-brand-700 dark:text-brand-300">
                <dt>Saldo pendiente</dt>
                <dd>{formatCopFromString(sale.amountDue ?? '0')}</dd>
              </div>
            </dl>
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Sin visibilidad financiera. Si necesitas ver los totales, pide el permiso
              <code className="mx-1 rounded bg-slate-100 px-1 dark:bg-slate-800">sales:view_financials</code>.
            </p>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        <header className="flex items-center justify-between px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Líneas</h3>
          {fromWorkOrder ? (
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Esta venta se originó desde una OT; las líneas no se editan aquí.
            </span>
          ) : null}
        </header>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800/80 dark:text-slate-400">
              <tr>
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2">Descripción</th>
                <th className="px-3 py-2 text-right">Cant.</th>
                <th className="px-3 py-2 text-right">Precio</th>
                <th className="px-3 py-2 text-right">Desc.</th>
                <th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {sale.lines.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                    Aún no hay líneas.
                  </td>
                </tr>
              ) : null}
              {sale.lines.map((line) => (
                <tr key={line.id}>
                  <td className="px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-300">
                    {line.lineType === 'PART' ? 'Repuesto' : 'Servicio'}
                  </td>
                  <td className="px-3 py-2">
                    {line.lineType === 'PART'
                      ? line.inventoryItem?.name ?? line.description ?? '—'
                      : line.service?.name ?? line.description ?? '—'}
                    {line.taxRate ? (
                      <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {line.taxRate.slug} {line.taxRate.ratePercent}%
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-right">{line.quantity}</td>
                  <td className="px-3 py-2 text-right">
                    {line.unitPrice != null ? formatCopFromString(line.unitPrice) : '—'}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {line.discountAmount != null
                      ? formatCopFromString(line.discountAmount)
                      : '—'}
                  </td>
                  <td className="px-3 py-2 text-right font-medium">
                    {line.totals?.lineTotal != null ? formatCopFromString(line.totals.lineTotal) : '—'}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {canDeleteLines ? (
                      <button
                        type="button"
                        onClick={() => onDeleteLine(line.id)}
                        className="text-xs text-rose-700 hover:underline dark:text-rose-300"
                      >
                        Quitar
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {canEditLines ? (
          <form
            onSubmit={onSubmitLine}
            className="grid grid-cols-1 gap-3 border-t border-slate-200 bg-slate-50 p-4 sm:grid-cols-12 dark:border-slate-700 dark:bg-slate-800/40"
          >
            <label className="sm:col-span-2 flex flex-col text-xs font-medium text-slate-600 dark:text-slate-300">
              Tipo
              <select
                value={lineDraft.kind}
                onChange={(e) =>
                  setLineDraft((d) => ({ ...d, kind: e.target.value as SaleLineType }))
                }
                className="mt-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900"
              >
                <option value="PART">Repuesto/insumo</option>
                <option value="LABOR">Servicio / mano de obra</option>
              </select>
            </label>
            {lineDraft.kind === 'PART' ? (
              <label className="sm:col-span-5 flex flex-col text-xs font-medium text-slate-600 dark:text-slate-300">
                Repuesto
                <select
                  value={lineDraft.inventoryItemId}
                  onChange={(e) => {
                    const id = e.target.value
                    const it = items.find((i) => i.id === id)
                    setLineDraft((d) => ({
                      ...d,
                      inventoryItemId: id,
                      description: '',
                      unitPrice: d.unitPrice,
                      quantity: d.quantity || '1',
                      taxRateId: d.taxRateId,
                      serviceId: '',
                    }))
                    void it
                  }}
                  className="mt-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900"
                >
                  <option value="">— Selecciona —</option>
                  {items.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.sku} · {i.name}
                      {i.trackStock ? ` (stock ${i.quantityOnHand})` : ''}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <>
                <label className="sm:col-span-3 flex flex-col text-xs font-medium text-slate-600 dark:text-slate-300">
                  Servicio (opcional)
                  <select
                    value={lineDraft.serviceId}
                    onChange={(e) => setLineDraft((d) => ({ ...d, serviceId: e.target.value }))}
                    className="mt-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900"
                  >
                    <option value="">— Libre —</option>
                    {services.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.code} · {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="sm:col-span-4 flex flex-col text-xs font-medium text-slate-600 dark:text-slate-300">
                  Descripción
                  <input
                    value={lineDraft.description}
                    onChange={(e) =>
                      setLineDraft((d) => ({ ...d, description: e.target.value }))
                    }
                    maxLength={2000}
                    minLength={3}
                    className="mt-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900"
                    required
                  />
                </label>
              </>
            )}
            <label className="sm:col-span-1 flex flex-col text-xs font-medium text-slate-600 dark:text-slate-300">
              Cantidad
              <input
                value={lineDraft.quantity}
                onChange={(e) => setLineDraft((d) => ({ ...d, quantity: e.target.value }))}
                inputMode="decimal"
                className="mt-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900"
                required
              />
            </label>
            <label className="sm:col-span-2 flex flex-col text-xs font-medium text-slate-600 dark:text-slate-300">
              Precio unit.
              <input
                value={lineDraft.unitPrice}
                onChange={(e) => setLineDraft((d) => ({ ...d, unitPrice: e.target.value }))}
                inputMode="numeric"
                placeholder={selectedItem?.averageCost ?? ''}
                className="mt-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900"
              />
            </label>
            <label className="sm:col-span-1 flex flex-col text-xs font-medium text-slate-600 dark:text-slate-300">
              Descuento
              <input
                value={lineDraft.discountAmount}
                onChange={(e) =>
                  setLineDraft((d) => ({ ...d, discountAmount: e.target.value }))
                }
                inputMode="numeric"
                className="mt-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900"
              />
            </label>
            <label className="sm:col-span-2 flex flex-col text-xs font-medium text-slate-600 dark:text-slate-300">
              Impuesto
              <select
                value={lineDraft.taxRateId}
                onChange={(e) => setLineDraft((d) => ({ ...d, taxRateId: e.target.value }))}
                className="mt-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900"
              >
                <option value="">— Sin impuesto —</option>
                {taxRates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.ratePercent}%)
                  </option>
                ))}
              </select>
            </label>
            <div className="sm:col-span-12 flex items-center justify-between">
              {lineMsg ? (
                <span className="text-xs text-rose-700 dark:text-rose-300">{lineMsg}</span>
              ) : (
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Las líneas no afectan inventario hasta que confirmes la venta.
                </span>
              )}
              <button
                type="submit"
                disabled={lineBusy}
                className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
              >
                {lineBusy ? 'Agregando…' : 'Agregar línea'}
              </button>
            </div>
          </form>
        ) : null}
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Acciones</h3>
          <div className="flex flex-wrap gap-2">
            {canConfirm ? (
              <button
                type="button"
                onClick={onConfirm}
                disabled={confirmBusy || sale.lines.length === 0}
                className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
                title={sale.lines.length === 0 ? 'Agrega líneas antes de confirmar' : undefined}
              >
                {confirmBusy ? 'Confirmando…' : 'Confirmar venta'}
              </button>
            ) : null}
            {canCreateInvoice ? (
              <button
                type="button"
                onClick={onCreateInvoice}
                disabled={invoiceBusy}
                className="rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
                title="Genera factura electrónica DIAN a partir de esta venta (queda en borrador si DIAN está apagado)"
              >
                {invoiceBusy ? 'Generando…' : 'Generar factura'}
              </button>
            ) : null}
            {canCancel ? (
              <div className="flex w-full flex-col gap-2 rounded-lg border border-dashed border-slate-300 p-3 dark:border-slate-600">
                <label className="flex flex-col text-xs font-medium text-slate-600 dark:text-slate-300">
                  Motivo de anulación
                  <input
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    maxLength={500}
                    className="mt-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
                  />
                </label>
                <button
                  type="button"
                  onClick={onCancel}
                  disabled={cancelBusy}
                  className="self-start rounded-lg bg-rose-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
                >
                  {cancelBusy ? 'Anulando…' : 'Anular venta'}
                </button>
              </div>
            ) : null}
          </div>
          {isCancelled && sale.cancelledReason ? (
            <p className="mt-3 text-xs text-rose-700 dark:text-rose-300">
              Motivo: {sale.cancelledReason}
            </p>
          ) : null}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Cobros</h3>

          {sale.payments.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">Sin cobros registrados.</p>
          ) : (
            <ul className="mb-3 space-y-1 text-xs">
              {sale.payments.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 border-b border-slate-100 py-1 dark:border-slate-800">
                  <span className="min-w-0 flex-1 truncate">
                    {new Date(p.createdAt).toLocaleString('es-CO')} ·{' '}
                    <span className="font-medium">
                      {p.amount != null ? formatCopFromString(p.amount) : '—'}
                    </span>{' '}
                    ·{' '}
                    <span className="text-slate-500 dark:text-slate-400">
                      {p.kind === 'FULL_SETTLEMENT' ? 'Liquidación' : 'Abono'}
                    </span>
                  </span>
                  <span className="text-slate-500 dark:text-slate-400">
                    {p.cashMovement.category.name}
                  </span>
                  <button
                    type="button"
                    onClick={async () => {
                      const res = await printTicketFromApi(
                        `/sales/${sale.id}/payments/${p.id}/receipt-ticket.json`,
                        { copies: 1, openDrawer: false },
                      )
                      setPayMsg(
                        res.ok ? 'Ticket reimpreso' : `No se pudo imprimir: ${res.hint}`,
                      )
                    }}
                    className="shrink-0 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                    title="Reimprimir ticket térmico"
                  >
                    Reimprimir
                  </button>
                </li>
              ))}
            </ul>
          )}

          {canRecordPayment ? (
            <form onSubmit={onRecordPayment} className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <label className="inline-flex items-center gap-1 text-xs">
                  <input
                    type="radio"
                    checked={payKind === 'partial'}
                    onChange={() => setPayKind('partial')}
                  />
                  Abono
                </label>
                <label className="inline-flex items-center gap-1 text-xs">
                  <input
                    type="radio"
                    checked={payKind === 'full'}
                    onChange={() => setPayKind('full')}
                  />
                  Pago total
                </label>
              </div>
              <label className="flex flex-col text-xs font-medium text-slate-600 dark:text-slate-300">
                Monto
                <input
                  value={payAmt}
                  onChange={(e) => setPayAmt(e.target.value)}
                  inputMode="numeric"
                  required
                  className="mt-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
                />
              </label>
              <label className="flex flex-col text-xs font-medium text-slate-600 dark:text-slate-300">
                Efectivo entregado (opcional)
                <input
                  value={payTender}
                  onChange={(e) => setPayTender(e.target.value)}
                  inputMode="numeric"
                  className="mt-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
                />
              </label>
              {incomeCats.length > 1 ? (
                <label className="flex flex-col text-xs font-medium text-slate-600 dark:text-slate-300">
                  Categoría
                  <select
                    value={payCat}
                    onChange={(e) => setPayCat(e.target.value)}
                    className="mt-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
                  >
                    {incomeCats.map((c) => (
                      <option key={c.id} value={c.slug}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label className="flex flex-col text-xs font-medium text-slate-600 dark:text-slate-300">
                Nota
                <textarea
                  value={payNote}
                  onChange={(e) => setPayNote(e.target.value)}
                  rows={2}
                  maxLength={2000}
                  required
                  className="mt-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
                />
              </label>
              <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={payTwoCopies}
                  onChange={(e) => setPayTwoCopies(e.target.checked)}
                />
                Imprimir 2 copias del ticket
              </label>
              {payMsg ? (
                <div className="rounded-lg border border-rose-300 bg-rose-50 px-2 py-1.5 text-xs text-rose-800 dark:border-rose-700 dark:bg-rose-900/30 dark:text-rose-200">
                  {payMsg}
                </div>
              ) : null}
              <button
                type="submit"
                disabled={payBusy}
                className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {payBusy ? 'Registrando…' : 'Registrar cobro'}
              </button>
            </form>
          ) : isConfirmed && sale.amountDue && Number(sale.amountDue) > 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Abre la caja y verifica permisos para registrar cobros.
            </p>
          ) : null}
        </div>
      </section>
    </div>
  )
}
