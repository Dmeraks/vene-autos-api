import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { useConfirm } from '../components/confirm/ConfirmProvider'
import { NotesMinCharCounter } from '../components/NotesMinCharCounter'
import {
  notesMinHint,
  parseNotesUiContext,
  SETTINGS_UI_CONTEXT_PATH,
  type SettingsUiContextResponse,
} from '../config/operationalNotes'
import type {
  InventoryItem,
  WorkOrderDetail,
  WorkOrderLine,
  WorkOrderLineType,
  WorkOrderStatus,
} from '../api/types'

type PaymentRow = {
  id: string
  amount: string
  createdAt: string
  note: string | null
  recordedBy: { fullName: string }
  cashMovement: { category: { slug: string; name: string } }
}

type CashCat = { slug: string; name: string; direction: string }

const STATUS: Record<WorkOrderStatus, { label: string; tone: string }> = {
  RECEIVED: { label: 'Recibida', tone: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200' },
  IN_WORKSHOP: { label: 'En taller', tone: 'bg-blue-50 text-blue-800 dark:bg-blue-950/60 dark:text-blue-200' },
  WAITING_PARTS: {
    label: 'Esperando repuestos',
    tone: 'bg-amber-50 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200',
  },
  READY: { label: 'Lista', tone: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/55 dark:text-emerald-200' },
  DELIVERED: { label: 'Entregada', tone: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200' },
  CANCELLED: { label: 'Cancelada', tone: 'bg-red-50 text-red-800 dark:bg-red-950/55 dark:text-red-200' },
}

function lineMoney(ln: WorkOrderLine): string {
  const q = Number(ln.quantity)
  const p = ln.unitPrice != null ? Number(ln.unitPrice) : 0
  if (Number.isNaN(q) || Number.isNaN(p)) return '—'
  return (q * p).toFixed(2)
}

export function WorkOrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { can } = useAuth()
  const confirm = useConfirm()
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

  const [payments, setPayments] = useState<PaymentRow[]>([])
  const [payAmt, setPayAmt] = useState('')
  const [payNote, setPayNote] = useState('')
  const [payCat, setPayCat] = useState('ingreso_cobro')
  const [payAck, setPayAck] = useState(false)
  const [incomeCats, setIncomeCats] = useState<CashCat[]>([])
  const [notesMinPayment, setNotesMinPayment] = useState(70)

  const [woDesc, setWoDesc] = useState('')
  const [woAuth, setWoAuth] = useState('')
  const [woStatus, setWoStatus] = useState<WorkOrderStatus>('RECEIVED')

  const load = useCallback(async () => {
    if (!id) return
    setErr(null)
    const data = await api<WorkOrderDetail>(`/work-orders/${id}`)
    setWo(data)
    setWoDesc(data.description)
    setWoAuth(data.authorizedAmount != null ? String(data.authorizedAmount) : '')
    setWoStatus(data.status)
    if (can('work_orders:read')) {
      try {
        setPayments(await api<PaymentRow[]>(`/work-orders/${id}/payments`))
      } catch {
        setPayments([])
      }
    }
  }, [id, can])

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
    if (!can('inventory_items:read')) return
    let cancelled = false
    ;(async () => {
      try {
        const list = await api<InventoryItem[]>('/inventory/items')
        if (!cancelled) setItems(list.filter((i) => i.trackStock && i.isActive))
      } catch {
        /* opcional */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [can])

  useEffect(() => {
    void api<SettingsUiContextResponse>(SETTINGS_UI_CONTEXT_PATH).then((r) =>
      setNotesMinPayment(parseNotesUiContext(r).notesMinLengthWorkOrderPayment),
    )
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!can('cash_movements:create_income')) return
    void api<CashCat[]>('/cash/categories')
      .then((c) => {
        const inc = c.filter((x) => x.direction === 'INCOME')
        setIncomeCats(inc)
        setPayCat((prev) => (inc.some((x) => x.slug === prev) ? prev : inc[0]?.slug ?? 'ingreso_cobro'))
      })
      .catch(() => undefined)
  }, [can])

  const closed = wo?.status === 'DELIVERED' || wo?.status === 'CANCELLED'
  const canMutateLines =
    wo && !closed && can('work_orders:update') && can('work_order_lines:create')
  const canDeleteLine = wo && !closed && can('work_orders:update') && can('work_order_lines:delete')
  const canUpdateLine = wo && !closed && can('work_orders:update') && can('work_order_lines:update')
  const canPay =
    wo &&
    wo.status !== 'CANCELLED' &&
    can('work_orders:record_payment') &&
    can('cash_movements:create_income')
  const canPatchWo = wo && can('work_orders:update')

  const partOptions = useMemo(
    () =>
      items.map((i) => (
        <option key={i.id} value={i.id}>
          {i.sku} — {i.name} (stock {i.quantityOnHand})
        </option>
      )),
    [items],
  )

  async function addLine() {
    if (!id || !canMutateLines) return
    setMsg(null)
    try {
      if (addKind === 'PART') {
        await api(`/work-orders/${id}/lines`, {
          method: 'POST',
          body: JSON.stringify({
            lineType: 'PART',
            inventoryItemId: partItemId,
            quantity: partQty,
            ...(partPrice.trim() ? { unitPrice: partPrice.trim() } : {}),
          }),
        })
      } else {
        await api(`/work-orders/${id}/lines`, {
          method: 'POST',
          body: JSON.stringify({
            lineType: 'LABOR',
            description: laborDesc.trim(),
            quantity: laborQty,
            ...(laborPrice.trim() ? { unitPrice: laborPrice.trim() } : {}),
          }),
        })
      }
      await load()
      setMsg('Línea agregada')
      setLaborDesc('')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Error al agregar')
    }
  }

  async function saveWorkOrder(e: React.FormEvent) {
    e.preventDefault()
    if (!id || !canPatchWo || !wo) return
    setMsg(null)

    const prevAuth = wo.authorizedAmount != null ? String(wo.authorizedAmount) : ''
    const newAuth = woAuth.trim()
    const newAuthNum = newAuth === '' ? null : Number(newAuth)
    const totalPaid = Number(wo.paymentSummary.totalPaid)
    const cancelNow = woStatus === 'CANCELLED' && wo.status !== 'CANCELLED'
    const descChanged = woDesc.trim() !== wo.description
    const statusChanged = woStatus !== wo.status
    const authChanged = newAuth !== prevAuth

    if (!descChanged && !statusChanged && !authChanged) {
      setMsg('Sin cambios en datos de la orden')
      return
    }

    const lines: string[] = ['¿Guardar cambios en la orden #' + wo.orderNumber + '?', '']
    if (descChanged) lines.push('· Descripción modificada')
    if (statusChanged) lines.push(`· Estado: ${STATUS[wo.status].label} → ${STATUS[woStatus].label}`)
    if (authChanged) lines.push(`· Tope cobros: ${prevAuth || 'sin tope'} → ${newAuth || 'sin tope'}`)
    if (cancelNow) {
      lines.push('', '⚠ La orden pasará a CANCELADA. Revisá cobros y líneas antes de continuar.')
    }
    if (newAuthNum != null && !Number.isNaN(newAuthNum) && totalPaid > newAuthNum) {
      lines.push('', '⚠ El tope es menor que el total ya cobrado en esta OT; el servidor puede rechazar el guardado.')
    }
    const okSave = await confirm({
      title: `Orden #${wo.orderNumber}`,
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
          authorizedAmount: woAuth.trim() === '' ? null : woAuth.trim(),
        }),
      })
      setMsg('Orden actualizada')
      await load()
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Error')
    }
  }

  async function recordPayment(e: React.FormEvent) {
    e.preventDefault()
    if (!id || !canPay || !wo) return
    if (!payAck) {
      setMsg('Marcá la casilla de confirmación: revisaste categoría, monto, nota y tope antes de registrar el cobro.')
      return
    }
    const pn = payNote.trim()
    if (pn.length < notesMinPayment) {
      setMsg(`Nota del cobro: al menos ${notesMinPayment} caracteres (política del taller).`)
      return
    }
    setMsg(null)
    const catName = incomeCats.find((c) => c.slug === payCat)?.name ?? payCat
    const remain = wo.paymentSummary.remaining
    const authLine = wo.authorizedAmount != null ? String(wo.authorizedAmount) : 'sin tope'
    const parts = [
      `¿Registrar cobro de $${payAmt.trim()}?`,
      `Categoría: ${catName}`,
      `Orden #${wo.orderNumber}`,
      `Subtotal líneas: $${wo.linesSubtotal}`,
      `Ya cobrado en OT: $${wo.paymentSummary.totalPaid}`,
      `Tope autorizado: ${authLine}`,
    ]
    if (remain != null) parts.push(`Saldo bajo tope (si aplica): $${remain}`)
    parts.push('', 'Se generará un ingreso en caja vinculado a esta orden.')
    const okPay = await confirm({
      title: 'Registrar cobro',
      message: parts.join('\n'),
      confirmLabel: 'Registrar cobro',
    })
    if (!okPay) return
    try {
      await api(`/work-orders/${id}/payments`, {
        method: 'POST',
        body: JSON.stringify({
          amount: payAmt.trim(),
          note: pn,
          categorySlug: payCat,
        }),
      })
      setPayAmt('')
      setPayNote('')
      setPayAck(false)
      setMsg('Cobro registrado')
      await load()
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Error')
    }
  }

  async function removeLine(lineId: string) {
    if (!id || !canDeleteLine) return
    const ok = await confirm({
      title: 'Quitar línea',
      message: '¿Eliminar esta línea de la orden? El importe de la OT se recalculará.',
      confirmLabel: 'Eliminar',
      variant: 'danger',
    })
    if (!ok) return
    setMsg(null)
    try {
      await api(`/work-orders/${id}/lines/${lineId}`, { method: 'DELETE' })
      await load()
      setMsg('Línea eliminada')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Error al eliminar')
    }
  }

  function startEdit(ln: WorkOrderLine) {
    setEditLine(ln)
    setEditQty(ln.quantity)
    setEditPrice(ln.unitPrice ?? '')
    setEditDesc(ln.description ?? '')
  }

  async function saveEdit() {
    if (!id || !editLine || !canUpdateLine) return
    setMsg(null)
    try {
      await api(`/work-orders/${id}/lines/${editLine.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          quantity: editQty,
          unitPrice: editPrice.trim() || null,
          ...(editLine.lineType === 'LABOR' ? { description: editDesc.trim() } : {}),
        }),
      })
      setEditLine(null)
      await load()
      setMsg('Línea actualizada')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Error al guardar')
    }
  }

  if (err || !id) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-800">
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

  return (
    <div className="space-y-8">
      <div>
        <Link
          to="/ordenes"
          className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-300 dark:hover:text-brand-200"
        >
          ← Órdenes
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
                Orden #{wo.orderNumber}
              </h1>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${st.tone}`}>{st.label}</span>
            </div>
            <p className="mt-2 max-w-3xl text-slate-600 dark:text-slate-400">{wo.description}</p>
          </div>
        </div>
      </div>

      {canPatchWo && (
        <form onSubmit={saveWorkOrder} className="va-card">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Datos de la orden</h2>
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
                {(
                  [
                    'RECEIVED',
                    'IN_WORKSHOP',
                    'WAITING_PARTS',
                    'READY',
                    'DELIVERED',
                    'CANCELLED',
                  ] as WorkOrderStatus[]
                ).map((s) => (
                  <option key={s} value={s}>
                    {STATUS[s].label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="va-label">Monto autorizado (tope)</span>
              <input
                value={woAuth}
                onChange={(e) => setWoAuth(e.target.value)}
                placeholder="Vacío = sin tope"
                className="va-field mt-1"
              />
            </label>
          </div>
          <button
            type="submit"
            className="mt-4 rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600"
          >
            Guardar orden
          </button>
        </form>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="va-card !p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Subtotal líneas</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-50">${wo.linesSubtotal}</p>
        </div>
        <div className="va-card !p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Cobrado</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-50">${wo.paymentSummary.totalPaid}</p>
        </div>
        <div className="va-card !p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Pendiente (tope)</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-50">
            {wo.paymentSummary.remaining != null ? `$${wo.paymentSummary.remaining}` : '—'}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50/90 px-4 py-3 text-sm leading-relaxed text-slate-700 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-200">
        <p className="font-semibold text-slate-900 dark:text-slate-50">Cómo encaja esta orden con la caja</p>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-slate-600 dark:text-slate-300">
          <li>
            <strong className="text-slate-800 dark:text-slate-100">El dinero entra en caja</strong> en el momento en que
            alguien registra un cobro en &quot;Cobros en caja&quot; más abajo: se crea un{' '}
            <strong>ingreso en la sesión de caja abierta</strong> y el sistema lo vincula solo a esta orden (referencia
            técnica <span className="font-mono">WorkOrder</span> + id de la OT). No tenés que repetir el ingreso en
            Caja → Ingreso. Para verlo en pantalla: <strong className="text-slate-800 dark:text-slate-100">Caja → pestaña
            Sesión → Movimientos de esta sesión</strong>, con enlace a la orden cuando aplica.
          </li>
          <li>
            <strong className="text-slate-800 dark:text-slate-100">Cambiar el estado</strong> de la orden (por ejemplo a
            Lista o Entregada) <strong>no mueve dinero por sí solo</strong>: solo indica en qué etapa está el trabajo en
            el taller.
          </li>
          <li>
            Con la orden en <strong>Entregada</strong> o <strong>Cancelada</strong> no se pueden editar líneas. En{' '}
            <strong>Cancelada</strong> tampoco se permiten cobros nuevos.
          </li>
        </ul>
      </div>

      {msg && <p className="va-card-muted">{msg}</p>}

      {closed && (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800/80 dark:bg-amber-950/40 dark:text-amber-100">
          {wo.status === 'CANCELLED'
            ? 'Orden cancelada: no se pueden editar líneas ni registrar cobros adicionales.'
            : 'Orden entregada: no se pueden editar líneas; los cobros ya registrados siguieron en caja el día que se cargaron.'}
        </p>
      )}

      <section className="va-card-flush overflow-hidden">
        <div className="border-b border-slate-100 px-4 py-3 sm:px-6 dark:border-slate-800">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Cobros en caja</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Ingresos vinculados a esta OT.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase text-slate-400 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-500">
                <th className="px-4 py-2 sm:px-6">Fecha</th>
                <th className="px-4 py-2 sm:px-6">Monto</th>
                <th className="px-4 py-2 sm:px-6">Categoría</th>
                <th className="px-4 py-2 sm:px-6">Registró</th>
              </tr>
            </thead>
            <tbody>
              {payments.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-2.5 text-center text-sm text-slate-500 sm:px-6 dark:text-slate-400">
                    Sin cobros registrados.
                  </td>
                </tr>
              )}
              {payments.map((p) => (
                <tr key={p.id} className="border-b border-slate-50 dark:border-slate-800/80">
                  <td className="px-4 py-2 font-mono text-xs text-slate-500 sm:px-6 dark:text-slate-400">
                    {new Date(p.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-2 font-medium tabular-nums text-slate-900 sm:px-6 dark:text-slate-50">${p.amount}</td>
                  <td className="px-4 py-2 text-slate-600 sm:px-6 dark:text-slate-300">{p.cashMovement.category.name}</td>
                  <td className="px-4 py-2 text-slate-600 sm:px-6 dark:text-slate-300">{p.recordedBy.fullName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {canPay && (
          <form onSubmit={recordPayment} className="border-t border-slate-100 p-4 dark:border-slate-800 sm:p-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-12 sm:items-start sm:gap-x-4 sm:gap-y-0">
              <div className="flex flex-col gap-3 sm:col-span-4">
                <label className="block text-sm">
                  <span className="va-label">Monto</span>
                  <input
                    required
                    value={payAmt}
                    onChange={(e) => setPayAmt(e.target.value)}
                    className="va-field mt-1 w-full"
                  />
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
                <span className="mt-1.5 text-xs leading-snug text-slate-500 dark:text-slate-400">
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
                  Confirmo que revisé monto, categoría, nota y tope antes de registrar el cobro.
                </span>
              </label>
              <button
                type="submit"
                className="w-full shrink-0 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 sm:w-auto sm:self-center"
              >
                Registrar cobro
              </button>
            </div>
          </form>
        )}
      </section>

      <section className="va-card-flush overflow-hidden">
        <div className="border-b border-slate-100 px-4 py-3 sm:px-6 dark:border-slate-800">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Líneas</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Repuestos (stock) y mano de obra.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-500">
                <th className="px-4 py-3 sm:px-6">Tipo</th>
                <th className="px-4 py-3 sm:px-6">Detalle</th>
                <th className="px-4 py-3 sm:px-6">Cant.</th>
                <th className="px-4 py-3 sm:px-6">P. unit.</th>
                <th className="px-4 py-3 sm:px-6">Importe</th>
                <th className="px-4 py-3 sm:px-6" />
              </tr>
            </thead>
            <tbody>
              {wo.lines.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-500 dark:text-slate-400">
                    Sin líneas aún.
                  </td>
                </tr>
              )}
              {wo.lines.map((ln) => (
                <tr key={ln.id} className="border-b border-slate-50 last:border-0 dark:border-slate-800/80">
                  <td className="px-4 py-3 sm:px-6">
                    <span
                      className={
                        ln.lineType === 'PART'
                          ? 'rounded-md bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-800 dark:bg-violet-950/55 dark:text-violet-200'
                          : 'rounded-md bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-800 dark:bg-teal-950/50 dark:text-teal-200'
                      }
                    >
                      {ln.lineType === 'PART' ? 'Repuesto' : 'Mano de obra'}
                    </span>
                  </td>
                  <td className="max-w-[220px] px-4 py-3 text-slate-700 sm:px-6 dark:text-slate-300">
                    {ln.lineType === 'PART' ? (
                      <span className="line-clamp-2">
                        {ln.inventoryItem ? `${ln.inventoryItem.sku} · ${ln.inventoryItem.name}` : ln.inventoryItemId}
                      </span>
                    ) : (
                      <span className="line-clamp-2">{ln.description ?? '—'}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-800 sm:px-6 dark:text-slate-200">{ln.quantity}</td>
                  <td className="px-4 py-3 font-mono text-slate-600 sm:px-6 dark:text-slate-400">
                    {ln.unitPrice != null ? `$${ln.unitPrice}` : '—'}
                  </td>
                  <td className="px-4 py-3 font-medium tabular-nums text-slate-900 sm:px-6 dark:text-slate-50">${lineMoney(ln)}</td>
                  <td className="px-4 py-3 sm:px-6">
                    {!closed && (canUpdateLine || canDeleteLine) && (
                      <div className="flex flex-wrap gap-2">
                        {canUpdateLine && (
                          <button
                            type="button"
                            onClick={() => startEdit(ln)}
                            className="text-xs font-medium text-brand-700 hover:underline dark:text-brand-300"
                          >
                            Editar
                          </button>
                        )}
                        {canDeleteLine && (
                          <button
                            type="button"
                            onClick={() => void removeLine(ln.id)}
                            className="text-xs font-medium text-red-600 hover:underline dark:text-red-400"
                          >
                            Quitar
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {editLine && canUpdateLine && (
        <div className="rounded-2xl border border-brand-200 bg-brand-50/40 p-4 dark:border-brand-800/60 dark:bg-brand-900/35 sm:p-6">
          <h3 className="font-semibold text-slate-900 dark:text-slate-50">Editar línea</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="va-label">Cantidad</span>
              <input value={editQty} onChange={(e) => setEditQty(e.target.value)} className="va-field mt-1" />
            </label>
            <label className="block text-sm">
              <span className="va-label">Precio unitario</span>
              <input
                value={editPrice}
                onChange={(e) => setEditPrice(e.target.value)}
                className="va-field mt-1"
                placeholder="Opcional"
              />
            </label>
            {editLine.lineType === 'LABOR' && (
              <label className="block text-sm sm:col-span-2">
                <span className="va-label">Descripción</span>
                <input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} className="va-field mt-1" />
              </label>
            )}
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => void saveEdit()}
              className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
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
      )}

      {canMutateLines && (
        <section className="va-card">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Agregar línea</h2>
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
              onClick={() => setAddKind('LABOR')}
              className={`va-tab ${addKind === 'LABOR' ? 'va-tab-active' : 'va-tab-inactive'}`}
            >
              Mano de obra
            </button>
          </div>

          {addKind === 'PART' ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <label className="block text-sm sm:col-span-2">
                <span className="va-label">Ítem</span>
                <select value={partItemId} onChange={(e) => setPartItemId(e.target.value)} className="va-field mt-1">
                  <option value="">Elegí repuesto…</option>
                  {partOptions}
                </select>
              </label>
              <label className="block text-sm">
                <span className="va-label">Cantidad</span>
                <input value={partQty} onChange={(e) => setPartQty(e.target.value)} className="va-field mt-1" />
              </label>
              <label className="block text-sm sm:col-span-3">
                <span className="va-label">Precio al cliente (opcional)</span>
                <input
                  value={partPrice}
                  onChange={(e) => setPartPrice(e.target.value)}
                  className="va-field mt-1 max-w-xs"
                  placeholder="ej. 25.00"
                />
              </label>
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
              <label className="block text-sm">
                <span className="va-label">Precio (opcional)</span>
                <input value={laborPrice} onChange={(e) => setLaborPrice(e.target.value)} className="va-field mt-1" />
              </label>
            </div>
          )}

          <button
            type="button"
            onClick={() => void addLine()}
            disabled={addKind === 'PART' ? !partItemId : laborDesc.trim().length < 3}
            className="mt-6 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-50"
          >
            Agregar a la orden
          </button>
        </section>
      )}
    </div>
  )
}
