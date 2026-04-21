import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { useCashSessionOpen } from '../context/CashSessionOpenContext'
import { useConfirm } from '../components/confirm/ConfirmProvider'
import { NotesMinCharCounter } from '../components/NotesMinCharCounter'
import { portalPath } from '../constants/portalPath'
import { PageHeader } from '../components/layout/PageHeader'
import { panelUsesModernShell } from '../config/operationalNotes'
import { usePanelTheme } from '../theme/PanelThemeProvider'
import {
  notesMinHint,
  parseNotesUiContext,
  SETTINGS_UI_CONTEXT_PATH,
  type SettingsUiContextResponse,
} from '../config/operationalNotes'
import type { InventoryItem } from '../api/types'
import {
  formatCopInteger,
  formatMoneyInputDisplayFromNormalized,
  normalizeMoneyDecimalStringForApi,
} from '../utils/copFormat'
import { successMessageWithDrawerPulse } from '../services/cashDrawerBridge'

type CostInputMode = 'per_unit' | 'line_total'

type LineDraft = {
  inventoryItemId: string
  quantity: string
  unitCost: string
  lineTotalCost: string
  costMode: CostInputMode
}

type PurchasePaymentSource = 'CASH_REGISTER' | 'BANK_TRANSFER'

function lineMoneyAddForTotal(l: LineDraft): number | null {
  const q = Number(l.quantity.trim())
  if (!Number.isFinite(q) || q <= 0) return null
  if (l.costMode === 'line_total') {
    const tNorm = normalizeMoneyDecimalStringForApi(l.lineTotalCost)
    if (!tNorm) return null
    const t = Number(tNorm)
    if (!Number.isFinite(t) || t <= 0) return null
    return t
  }
  const uNorm = normalizeMoneyDecimalStringForApi(l.unitCost)
  if (!uNorm) return null
  const u = Number(uNorm)
  if (!Number.isFinite(u) || u <= 0) return null
  return q * Math.ceil(u - 1e-9)
}

export function ReceiveStockPage() {
  const panelTheme = usePanelTheme()
  const isSaas = panelUsesModernShell(panelTheme)
  const confirm = useConfirm()
  const { open: cashOpen, loadStatus: cashOpenLoadStatus, refresh: refreshCashOpen } = useCashSessionOpen()
  const [items, setItems] = useState<InventoryItem[]>([])
  const [lines, setLines] = useState<LineDraft[]>([
    { inventoryItemId: '', quantity: '1', unitCost: '', lineTotalCost: '', costMode: 'per_unit' },
  ])
  const [note, setNote] = useState('')
  const [supplierRef, setSupplierRef] = useState('')
  /** Efectivo en caja física (egreso) vs pago fuera de caja (p. ej. transferencia). */
  const [paymentSource, setPaymentSource] = useState<PurchasePaymentSource>('CASH_REGISTER')
  const [msg, setMsg] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [notesMin, setNotesMin] = useState(25)
  const blockCardClass = isSaas
    ? 'va-card space-y-4 border-amber-200/85 bg-amber-50/90 shadow-sm dark:border-amber-900/45 dark:bg-amber-950/35'
    : 'va-card space-y-4 border-amber-200 bg-amber-50/90 dark:border-amber-900/45 dark:bg-amber-950/35'
  const formCardClass = isSaas ? 'va-saas-page-section space-y-6' : 'va-card space-y-6'
  const submitBtnClass = 'va-btn-primary w-full py-3 disabled:opacity-60 sm:w-auto sm:px-8'
  const purchaseMoneyTotal = useMemo(() => {
    let sum = 0
    let any = false
    for (const l of lines) {
      const v = lineMoneyAddForTotal(l)
      if (v == null) continue
      any = true
      sum += v
    }
    if (!any) return 0
    return Math.ceil(sum - 1e-9)
  }, [lines])

  useEffect(() => {
    void api<SettingsUiContextResponse>(SETTINGS_UI_CONTEXT_PATH)
      .then((r) => setNotesMin(parseNotesUiContext(r).notesMinLengthChars))
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const list = await api<InventoryItem[]>('/inventory/items')
        if (!cancelled) setItems(list.filter((i) => i.trackStock && i.isActive))
      } catch {
        /* */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  function addRow() {
    setLines((ls) => [
      ...ls,
      { inventoryItemId: '', quantity: '1', unitCost: '', lineTotalCost: '', costMode: 'per_unit' },
    ])
  }

  function updateRow(i: number, patch: Partial<LineDraft>) {
    setLines((ls) => ls.map((row, j) => (j === i ? { ...row, ...patch } : row)))
  }

  function removeRow(i: number) {
    setLines((ls) => (ls.length <= 1 ? ls : ls.filter((_, j) => j !== i)))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    const valid = lines.filter((l) => l.inventoryItemId && Number(l.quantity) > 0)
    if (!valid.length) {
      setMsg('Agregá al menos una línea con ítem y cantidad.')
      return
    }
    const byId = new Map(items.map((it) => [it.id, it]))
    const linesSummary = valid
      .map((l) => {
        const it = byId.get(l.inventoryItemId)
        const label = it ? `${it.sku} — ${it.name}` : l.inventoryItemId
        const unitName = it?.measurementUnit?.name?.trim() || 'unidad'
        const q = Number(l.quantity.trim())
        if (l.costMode === 'line_total' && normalizeMoneyDecimalStringForApi(l.lineTotalCost)) {
          const tNorm = normalizeMoneyDecimalStringForApi(l.lineTotalCost)
          const t = Number(tNorm)
          const refCu =
            Number.isFinite(q) && q > 0 && Number.isFinite(t)
              ? formatCopInteger(Math.ceil(t / q - 1e-9))
              : null
          const totStr = Number.isFinite(t) ? formatCopInteger(t) : tNorm
          const refFrag = refCu ? ` · ref. c/u (división) $${refCu}` : ''
          return `· ${label}: ${l.quantity.trim()} ${unitName} · total línea $${totStr}${refFrag}`
        }
        const uNorm = normalizeMoneyDecimalStringForApi(l.unitCost)
        const u = uNorm ? Number(uNorm) : NaN
        const lineTot =
          uNorm && Number.isFinite(q) && Number.isFinite(u) && q > 0
            ? formatCopInteger(q * Math.ceil(u - 1e-9))
            : null
        const cost = uNorm ? `$${formatCopInteger(Number.isFinite(u) ? u : 0)} c/u (techo)` : 'sin costo.'
        const totFrag = lineTot ? ` · subtotal $${lineTot}` : ''
        return `· ${label}: ${l.quantity.trim()} ${unitName} (${cost})${totFrag}`
      })
      .join('\n')
    const moneyNote =
      purchaseMoneyTotal > 0 && paymentSource === 'CASH_REGISTER'
        ? `\n\nPago en efectivo desde caja: egreso “compra de repuestos” $${formatCopInteger(purchaseMoneyTotal)}. Requiere sesión de caja abierta.`
        : purchaseMoneyTotal > 0 && paymentSource === 'BANK_TRANSFER'
          ? `\n\nPago por transferencia u otro medio externo: no se registra egreso en caja física (sí se actualiza costo medio si informaste costos).`
          : '\n\nSin montos de costo informados: no hay egreso en caja.'
    const ok = await confirm({
      title: 'Registrar recepción de compra',
      message: `¿Registrar esta recepción de compra?\n\n${linesSummary}\n\nSe actualiza el stock y, si informás costo, el costo medio del ítem.${moneyNote}`,
      confirmLabel: 'Registrar',
    })
    if (!ok) return
    const nt = note.trim()
    if (nt.length < notesMin) {
      setMsg(`Nota: al menos ${notesMin} caracteres (política del taller).`)
      return
    }
    if (cashOpen !== true) {
      setMsg('Recepción de compra habilitada solo con sesión de caja abierta. Abrí sesión en Caja o pedí a un responsable.')
      return
    }
    setLoading(true)
    const hadCashMovement =
      paymentSource === 'CASH_REGISTER' && purchaseMoneyTotal > 0
    try {
      await api('/inventory/purchase-receipts', {
        method: 'POST',
        body: JSON.stringify({
          note: nt,
          supplierReference: supplierRef.trim() || undefined,
          paymentSource,
          lines: valid.map((l) => {
            const base = { inventoryItemId: l.inventoryItemId, quantity: l.quantity.trim() }
            if (l.costMode === 'line_total' && normalizeMoneyDecimalStringForApi(l.lineTotalCost)) {
              return { ...base, lineTotalCost: normalizeMoneyDecimalStringForApi(l.lineTotalCost) }
            }
            if (l.costMode === 'per_unit' && normalizeMoneyDecimalStringForApi(l.unitCost)) {
              return { ...base, unitCost: normalizeMoneyDecimalStringForApi(l.unitCost) }
            }
            return base
          }),
        }),
      })
      setLines([{ inventoryItemId: '', quantity: '1', unitCost: '', lineTotalCost: '', costMode: 'per_unit' }])
      setNote('')
      setSupplierRef('')
      setPaymentSource('CASH_REGISTER')
      setMsg(
        hadCashMovement
          ? await successMessageWithDrawerPulse('Recepción registrada correctamente.')
          : 'Recepción registrada correctamente.',
      )
      await refreshCashOpen()
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Error al registrar')
    } finally {
      setLoading(false)
    }
  }

  if (cashOpen !== true) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Recepción de compra"
          description="Entrada de mercadería y costos al inventario. Disponible solo con caja abierta."
        />
        <div className={blockCardClass}>
          {cashOpen === null ? (
            <p className="text-sm text-slate-800 dark:text-slate-200">Consultando estado de caja…</p>
          ) : cashOpenLoadStatus === 'error' ? (
            <>
              <p className="text-sm text-slate-800 dark:text-slate-200">
                No se pudo verificar la sesión. Reintentá o abrí Caja desde el menú.
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => void refreshCashOpen()}
                  className="rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-900 dark:bg-slate-600"
                >
                  Reintentar
                </button>
                <Link
                  to={portalPath('/caja')}
                  className="inline-flex min-h-[44px] items-center text-sm font-medium text-brand-800 underline dark:text-brand-200"
                >
                  Ir a Caja
                </Link>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-amber-950 dark:text-amber-100">
                Caja cerrada. La recepción de compra no está disponible hasta abrir sesión (incluye compras por
                transferencia: política del taller).
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => void refreshCashOpen()}
                  className="rounded-xl bg-amber-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-900 dark:bg-amber-700"
                >
                  Actualizar estado
                </button>
                <Link
                  to={portalPath('/caja')}
                  className="inline-flex min-h-[44px] items-center text-sm font-medium text-amber-950 underline dark:text-amber-50"
                >
                  Ir a Caja
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Recepción de compra"
        description={
          <>
            Entrada de mercadería al taller. Podés cargar costo{' '}
            <strong className="font-medium text-slate-700 dark:text-slate-200">por unidad de inventario</strong> o{' '}
            <strong className="font-medium text-slate-700 dark:text-slate-200">total pagado por la línea</strong> (ej.
            caneca: cantidad en galones + total factura). Los pesos se redondean hacia arriba al entero (sin centavos).
            Si pagás en{' '}
            <strong className="font-medium text-slate-700 dark:text-slate-200">efectivo desde caja</strong> y la compra
            tiene monto, se registra un egreso (compra de repuestos) y hace falta{' '}
            <strong className="font-medium text-slate-700 dark:text-slate-200">sesión de caja abierta</strong>. Con{' '}
            <strong className="font-medium text-slate-700 dark:text-slate-200">transferencia u otro pago externo</strong>{' '}
            no se mueve la caja física.
          </>
        }
      />

      {msg && <p className="va-card-muted">{msg}</p>}

      <form onSubmit={submit} className={formCardClass}>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm sm:col-span-2">
            <span className="va-label">Nota de la recepción</span>
            <textarea
              required
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="va-field mt-1 resize-y"
              placeholder="Ej. factura del proveedor, OC interna, condición de la mercadería…"
            />
            <span className="mt-1 block text-xs text-slate-500 dark:text-slate-300">{notesMinHint(notesMin)}</span>
            <NotesMinCharCounter value={note} minLength={notesMin} />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="va-label">Ref. proveedor / factura (opcional)</span>
            <input value={supplierRef} onChange={(e) => setSupplierRef(e.target.value)} className="va-field mt-1" />
          </label>
          <fieldset className="block text-sm sm:col-span-2">
            <legend className="va-label">Forma de pago de la compra</legend>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-6">
              <label className="flex cursor-pointer items-center gap-2 text-slate-700 dark:text-slate-200">
                <input
                  type="radio"
                  name="purchase-pay"
                  checked={paymentSource === 'CASH_REGISTER'}
                  onChange={() => setPaymentSource('CASH_REGISTER')}
                  className="h-4 w-4 border-slate-300 text-brand-600 focus:ring-brand-500"
                />
                <span>Efectivo desde caja (egreso si informás costos)</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-slate-700 dark:text-slate-200">
                <input
                  type="radio"
                  name="purchase-pay"
                  checked={paymentSource === 'BANK_TRANSFER'}
                  onChange={() => setPaymentSource('BANK_TRANSFER')}
                  className="h-4 w-4 border-slate-300 text-brand-600 focus:ring-brand-500"
                />
                <span>Transferencia u otro (no mueve caja física)</span>
              </label>
            </div>
          </fieldset>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Líneas</h2>
            <button
              type="button"
              onClick={addRow}
              className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-300"
            >
              + Añadir línea
            </button>
          </div>
          {lines.map((line, i) => {
            const sel = items.find((it) => it.id === line.inventoryItemId)
            const unitName = sel?.measurementUnit?.name?.trim() || null
            return (
            <div
              key={i}
              className="grid gap-3 rounded-xl border border-slate-100 bg-slate-50/80 p-3 dark:border-slate-700 dark:bg-slate-800/50 sm:grid-cols-12 sm:items-start"
            >
              <label className="block text-sm sm:col-span-4">
                <span className="va-label">Ítem</span>
                <select
                  value={line.inventoryItemId}
                  onChange={(e) => updateRow(i, { inventoryItemId: e.target.value })}
                  className="va-field mt-1"
                >
                  <option value="">Elegir…</option>
                  {items.map((it) => (
                    <option key={it.id} value={it.id}>
                      {it.sku} — {it.name}
                    </option>
                  ))}
                </select>
                {unitName ? (
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-300">
                    Unidad de medida: <span className="font-medium text-slate-700 dark:text-slate-200">{unitName}</span>
                  </p>
                ) : null}
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className="va-label">Cantidad{unitName ? ` (${unitName})` : ''}</span>
                <input
                  value={line.quantity}
                  onChange={(e) => updateRow(i, { quantity: e.target.value })}
                  className="va-field mt-1"
                />
              </label>
              <div className="block text-sm sm:col-span-5">
                <span className="va-label">Costo de la línea</span>
                <div className="mt-1 flex flex-col gap-2 text-sm text-slate-600 sm:flex-row sm:flex-wrap sm:gap-4 dark:text-slate-300">
                  <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 sm:min-h-0">
                    <input
                      type="radio"
                      name={`cost-mode-${i}`}
                      checked={line.costMode === 'per_unit'}
                      onChange={() =>
                        updateRow(i, { costMode: 'per_unit', lineTotalCost: '' })
                      }
                      className="h-4 w-4 shrink-0 border-slate-300 text-brand-600 dark:border-slate-500"
                    />
                    Por unidad
                  </label>
                  <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 sm:min-h-0">
                    <input
                      type="radio"
                      name={`cost-mode-${i}`}
                      checked={line.costMode === 'line_total'}
                      onChange={() => updateRow(i, { costMode: 'line_total', unitCost: '' })}
                      className="h-4 w-4 shrink-0 border-slate-300 text-brand-600 dark:border-slate-500"
                    />
                    Total línea (ej. caneca)
                  </label>
                </div>
                {line.costMode === 'per_unit' ? (
                  <>
                    <input
                      inputMode="decimal"
                      autoComplete="off"
                      value={formatMoneyInputDisplayFromNormalized(
                        normalizeMoneyDecimalStringForApi(line.unitCost),
                      )}
                      onChange={(e) =>
                        updateRow(i, { unitCost: normalizeMoneyDecimalStringForApi(e.target.value) })
                      }
                      className="va-field mt-1"
                      placeholder="COP por unidad de inventario"
                    />
                    {(() => {
                      const q = Number(line.quantity.trim())
                      const uNorm = normalizeMoneyDecimalStringForApi(line.unitCost)
                      const u = Number(uNorm)
                      if (!uNorm || Number.isNaN(q) || Number.isNaN(u) || q <= 0) return null
                      const uCeil = Math.ceil(u - 1e-9)
                      return (
                        <p className="mt-1 text-xs tabular-nums text-slate-500 dark:text-slate-300">
                          Subtotal (techo c/u):{' '}
                          <span className="font-medium text-slate-700 dark:text-slate-200">
                            ${formatCopInteger(q * uCeil)}
                          </span>{' '}
                          <span className="text-slate-400">
                            ({q} × ${formatCopInteger(uCeil)})
                          </span>
                        </p>
                      )
                    })()}
                  </>
                ) : (
                  <>
                    <input
                      inputMode="decimal"
                      autoComplete="off"
                      value={formatMoneyInputDisplayFromNormalized(
                        normalizeMoneyDecimalStringForApi(line.lineTotalCost),
                      )}
                      onChange={(e) =>
                        updateRow(i, { lineTotalCost: normalizeMoneyDecimalStringForApi(e.target.value) })
                      }
                      className="va-field mt-1"
                      placeholder="Total pagado por la cantidad de arriba"
                    />
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-300">
                      La cantidad debe ser el total que entró a stock en la unidad del ítem (p. ej. 55 galones).
                    </p>
                    {(() => {
                      const q = Number(line.quantity.trim())
                      const tNorm = normalizeMoneyDecimalStringForApi(line.lineTotalCost)
                      const t = Number(tNorm)
                      if (!tNorm || Number.isNaN(q) || Number.isNaN(t) || q <= 0 || t <= 0)
                        return null
                      const ref = t / q
                      const uSys = Math.ceil(ref - 1e-9)
                      return (
                        <p className="mt-1 text-xs tabular-nums text-slate-500 dark:text-slate-300">
                          Ref. c/u (división, techo):{' '}
                          <span className="font-medium">${formatCopInteger(Math.ceil(ref - 1e-9))}</span>
                          {' · '}
                          C/u en sistema (techo): <span className="font-medium">${formatCopInteger(uSys)}</span>
                        </p>
                      )
                    })()}
                  </>
                )}
              </div>
              <div className="flex sm:col-span-1 sm:justify-end">
                {lines.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    className="text-sm text-red-600 hover:underline"
                  >
                    Quitar
                  </button>
                )}
              </div>
            </div>
            )
          })}
        </div>

        {purchaseMoneyTotal > 0 && (
          <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-600 dark:bg-slate-800/60 dark:text-slate-200">
            <span className="font-medium">Total compra (costos informados):</span>{' '}
            <span className="tabular-nums font-semibold text-slate-900 dark:text-slate-50">${formatCopInteger(purchaseMoneyTotal)}</span>
            {paymentSource === 'BANK_TRANSFER' ? (
              <span className="block pt-1 text-xs text-slate-500 dark:text-slate-300">
                Con transferencia / pago externo este total no genera movimiento en caja física.
              </span>
            ) : null}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className={submitBtnClass}
        >
          {loading ? 'Guardando…' : 'Registrar recepción'}
        </button>
      </form>
    </div>
  )
}
