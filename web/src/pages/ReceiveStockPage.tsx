import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { useConfirm } from '../components/confirm/ConfirmProvider'
import { NotesMinCharCounter } from '../components/NotesMinCharCounter'
import {
  notesMinHint,
  parseNotesUiContext,
  SETTINGS_UI_CONTEXT_PATH,
  type SettingsUiContextResponse,
} from '../config/operationalNotes'
import type { InventoryItem } from '../api/types'

type LineDraft = { inventoryItemId: string; quantity: string; unitCost: string }

export function ReceiveStockPage() {
  const confirm = useConfirm()
  const [items, setItems] = useState<InventoryItem[]>([])
  const [lines, setLines] = useState<LineDraft[]>([{ inventoryItemId: '', quantity: '1', unitCost: '' }])
  const [note, setNote] = useState('')
  const [supplierRef, setSupplierRef] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [notesMin, setNotesMin] = useState(25)

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
    setLines((ls) => [...ls, { inventoryItemId: '', quantity: '1', unitCost: '' }])
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
        const cost = l.unitCost.trim() ? `$${l.unitCost.trim()} c/u` : 'sin costo unit.'
        return `· ${label}: ${l.quantity.trim()} u. (${cost})`
      })
      .join('\n')
    const ok = await confirm({
      title: 'Registrar recepción de compra',
      message: `¿Registrar esta recepción de compra?\n\n${linesSummary}\n\nSe actualiza el stock y, si informás costo, el costo medio del ítem.`,
      confirmLabel: 'Registrar',
    })
    if (!ok) return
    const nt = note.trim()
    if (nt.length < notesMin) {
      setMsg(`Nota: al menos ${notesMin} caracteres (política del taller).`)
      return
    }
    setLoading(true)
    try {
      await api('/inventory/purchase-receipts', {
        method: 'POST',
        body: JSON.stringify({
          note: nt,
          supplierReference: supplierRef.trim() || undefined,
          lines: valid.map((l) => ({
            inventoryItemId: l.inventoryItemId,
            quantity: l.quantity.trim(),
            ...(l.unitCost.trim() ? { unitCost: l.unitCost.trim() } : {}),
          })),
        }),
      })
      setLines([{ inventoryItemId: '', quantity: '1', unitCost: '' }])
      setNote('')
      setSupplierRef('')
      setMsg('Recepción registrada correctamente.')
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Error al registrar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">Recepción de compra</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Entrada de mercadería al taller. Actualiza stock y costo medio cuando informás costo.
        </p>
      </div>

      {msg && <p className="va-card-muted">{msg}</p>}

      <form onSubmit={submit} className="va-card space-y-6">
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
            <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">{notesMinHint(notesMin)}</span>
            <NotesMinCharCounter value={note} minLength={notesMin} />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="va-label">Ref. proveedor / factura (opcional)</span>
            <input value={supplierRef} onChange={(e) => setSupplierRef(e.target.value)} className="va-field mt-1" />
          </label>
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
          {lines.map((line, i) => (
            <div
              key={i}
              className="grid gap-3 rounded-xl border border-slate-100 bg-slate-50/80 p-3 dark:border-slate-700 dark:bg-slate-800/50 sm:grid-cols-12 sm:items-end"
            >
              <label className="block text-sm sm:col-span-5">
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
              </label>
              <label className="block text-sm sm:col-span-3">
                <span className="va-label">Cantidad</span>
                <input
                  value={line.quantity}
                  onChange={(e) => updateRow(i, { quantity: e.target.value })}
                  className="va-field mt-1"
                />
              </label>
              <label className="block text-sm sm:col-span-3">
                <span className="va-label">Costo unit. (opc.)</span>
                <input
                  value={line.unitCost}
                  onChange={(e) => updateRow(i, { unitCost: e.target.value })}
                  className="va-field mt-1"
                />
              </label>
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
          ))}
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-60 sm:w-auto sm:px-8"
        >
          {loading ? 'Guardando…' : 'Registrar recepción'}
        </button>
      </form>
    </div>
  )
}
