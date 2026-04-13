import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import type { InventoryItem, MeasurementUnit } from '../api/types'

export function InventoryPage() {
  const { can } = useAuth()
  const [rows, setRows] = useState<InventoryItem[] | null>(null)
  const [units, setUnits] = useState<MeasurementUnit[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [sku, setSku] = useState('')
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('unit')
  const [initialQty, setInitialQty] = useState('0')
  const [editItem, setEditItem] = useState<InventoryItem | null>(null)
  const [editName, setEditName] = useState('')
  const [editAvgCost, setEditAvgCost] = useState('')
  const [editTrack, setEditTrack] = useState(true)
  const [editActive, setEditActive] = useState(true)

  const load = async () => {
    const data = await api<InventoryItem[]>('/inventory/items')
    setRows(data)
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const u = await api<MeasurementUnit[]>('/inventory/measurement-units')
        if (!cancelled && u.length) {
          setUnits(u)
          setSlug((s) => (u.some((x) => x.slug === s) ? s : u[0].slug))
        }
      } catch {
        /* */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        await load()
      } catch {
        if (!cancelled) setErr('No se pudo cargar el inventario')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  function openEdit(r: InventoryItem) {
    setEditItem(r)
    setEditName(r.name)
    setEditAvgCost(r.averageCost ?? '')
    setEditTrack(r.trackStock)
    setEditActive(r.isActive)
    setMsg(null)
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editItem) return
    setMsg(null)
    try {
      await api(`/inventory/items/${editItem.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editName.trim(),
          averageCost: editAvgCost.trim() === '' ? null : editAvgCost.trim(),
          trackStock: editTrack,
          isActive: editActive,
        }),
      })
      setEditItem(null)
      await load()
      setMsg('Ítem actualizado')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Error al guardar')
    }
  }

  async function createItem(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    try {
      await api('/inventory/items', {
        method: 'POST',
        body: JSON.stringify({
          sku: sku.trim(),
          name: name.trim(),
          measurementUnitSlug: slug,
          initialQuantity: initialQty.trim() || '0',
        }),
      })
      setOpen(false)
      setSku('')
      setName('')
      setInitialQty('0')
      await load()
      setMsg('Ítem creado')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Error al crear')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">Repuestos e ítems</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Catálogo con stock aproximado para las órdenes.</p>
        </div>
        {can('inventory_items:create') && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700"
          >
            Nuevo ítem
          </button>
        )}
      </div>

      {err && (
        <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-200">
          {err}
        </p>
      )}
      {msg && <p className="va-card-muted">{msg}</p>}

      {!rows && !err && <p className="text-slate-500 dark:text-slate-400">Cargando…</p>}

      {rows && (
        <div className="va-card-flush overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-500">
                  <th className="px-4 py-3 sm:px-6">SKU</th>
                  <th className="px-4 py-3 sm:px-6">Nombre</th>
                  <th className="px-4 py-3 sm:px-6">Unidad</th>
                  <th className="px-4 py-3 sm:px-6">Stock</th>
                  <th className="px-4 py-3 sm:px-6">Activo</th>
                  {can('inventory_items:update') && (
                    <th className="px-4 py-3 sm:px-6 text-right">Acciones</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-slate-50 last:border-0 dark:border-slate-800/80">
                    <td className="px-4 py-3 font-mono text-xs text-slate-600 sm:px-6 dark:text-slate-400">{r.sku}</td>
                    <td className="px-4 py-3 font-medium text-slate-900 sm:px-6 dark:text-slate-50">{r.name}</td>
                    <td className="px-4 py-3 text-slate-600 sm:px-6 dark:text-slate-300">{r.measurementUnit.name}</td>
                    <td className="px-4 py-3 font-mono text-slate-800 sm:px-6 dark:text-slate-200">{r.quantityOnHand}</td>
                    <td className="px-4 py-3 text-slate-600 sm:px-6 dark:text-slate-300">{r.isActive ? 'Sí' : 'No'}</td>
                    {can('inventory_items:update') && (
                      <td className="px-4 py-3 text-right sm:px-6">
                        <button
                          type="button"
                          onClick={() => openEdit(r)}
                          className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          Editar
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editItem && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center"
          role="presentation"
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-600 dark:bg-slate-900 dark:shadow-black/40"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-item-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="edit-item-title" className="text-lg font-semibold text-slate-900 dark:text-slate-50">
              Editar ítem
            </h2>
            <p className="mt-1 font-mono text-xs text-slate-500 dark:text-slate-400">{editItem.sku}</p>
            <form className="mt-4 space-y-3" onSubmit={saveEdit}>
              <label className="block text-sm">
                <span className="va-label">Nombre</span>
                <input
                  required
                  minLength={2}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="va-field mt-1"
                />
              </label>
              <label className="block text-sm">
                <span className="va-label">Costo promedio (vacío = sin costo)</span>
                <input value={editAvgCost} onChange={(e) => setEditAvgCost(e.target.value)} className="va-field mt-1" />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editTrack}
                  onChange={(e) => setEditTrack(e.target.checked)}
                  className="rounded border-slate-300 dark:border-slate-500"
                />
                <span className="text-slate-600 dark:text-slate-300">Controlar stock</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editActive}
                  onChange={(e) => setEditActive(e.target.checked)}
                  className="rounded border-slate-300 dark:border-slate-500"
                />
                <span className="text-slate-600 dark:text-slate-300">Activo en catálogo</span>
              </label>
              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
                >
                  Guardar
                </button>
                <button
                  type="button"
                  onClick={() => setEditItem(null)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center"
          role="presentation"
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-600 dark:bg-slate-900 dark:shadow-black/40"
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-item-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="new-item-title" className="text-lg font-semibold text-slate-900 dark:text-slate-50">
              Nuevo ítem
            </h2>
            <form className="mt-4 space-y-3" onSubmit={createItem}>
              <label className="block text-sm">
                <span className="va-label">SKU</span>
                <input required value={sku} onChange={(e) => setSku(e.target.value)} className="va-field mt-1" />
              </label>
              <label className="block text-sm">
                <span className="va-label">Nombre</span>
                <input required value={name} onChange={(e) => setName(e.target.value)} className="va-field mt-1" />
              </label>
              <label className="block text-sm">
                <span className="va-label">Unidad</span>
                <select value={slug} onChange={(e) => setSlug(e.target.value)} className="va-field mt-1">
                  {units.map((u) => (
                    <option key={u.id} value={u.slug}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="va-label">Cantidad inicial</span>
                <input value={initialQty} onChange={(e) => setInitialQty(e.target.value)} className="va-field mt-1" />
              </label>
              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
                >
                  Crear
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
