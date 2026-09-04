import { useCallback, useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { PageHeader } from '../components/layout/PageHeader'
import { panelUsesModernShell } from '../config/operationalNotes'
import { STALE_INVENTORY_CATALOG_MS } from '../constants/queryStaleTime'
import {
  readInventoryHiddenDevEnabled,
  setInventoryHiddenDevEnabled,
} from '../constants/inventoryHiddenDev'
import {
  fetchInventoryHiddenItemsForQuery,
  fetchInventoryItemsForQuery,
  fetchMeasurementUnitsForQuery,
} from '../features/inventory/services/inventoryCatalogApi'
import { queryKeys } from '../lib/queryKeys'
import { usePanelTheme } from '../theme/PanelThemeProvider'
import type { InventoryItem, MeasurementUnit } from '../api/types'
import {
  API_MONEY_DECIMAL_REGEX,
  formatMoneyInputDisplayFromNormalized,
  normalizeMoneyDecimalStringForApi,
} from '../utils/copFormat'

const INVENTORY_QUERY_GC_MS = 20 * 60_000

export function InventoryPage() {
  const panelTheme = usePanelTheme()
  const isSaas = panelUsesModernShell(panelTheme)
  const queryClient = useQueryClient()
  const { can } = useAuth()
  const showInvActions = can('inventory_items:update')
  const showInvDelete = can('inventory_items:delete')
  const showStubDevTools = can('inventory_items:read')
  const showInvActionsCol = showInvActions || showInvDelete
  const [units, setUnits] = useState<MeasurementUnit[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [sku, setSku] = useState('')
  const [name, setName] = useState('')
  const [newReference, setNewReference] = useState('')
  const [slug, setSlug] = useState('unit')
  const [initialQty, setInitialQty] = useState('0')
  const [editItem, setEditItem] = useState<InventoryItem | null>(null)
  const [editName, setEditName] = useState('')
  const [editReference, setEditReference] = useState('')
  const [editSupplier, setEditSupplier] = useState('')
  const [editCategory, setEditCategory] = useState('')
  const [editAvgCost, setEditAvgCost] = useState('')
  const [editTrack, setEditTrack] = useState(true)
  const [editActive, setEditActive] = useState(true)
  const [newSupplier, setNewSupplier] = useState('')
  const [newCategory, setNewCategory] = useState('')
  const [hiddenDevEnabled, setHiddenDevEnabled] = useState(readInventoryHiddenDevEnabled)
  const createBtnClass = 'va-btn-primary w-full shrink-0 sm:w-auto'
  const tableWrapClass = isSaas
    ? 'va-saas-page-section va-saas-page-section--flush min-w-0'
    : 'va-card-flush min-w-0'

  function formatMoney(value: string | null | undefined): string {
    if (value == null || value === '') return '—'
    const n = Number(value)
    if (Number.isNaN(n)) return value
    return Math.ceil(n - 1e-9).toLocaleString('es-CO', { maximumFractionDigits: 0 })
  }

  /** Evita que SKU u otros códigos se muestren en varias líneas (Excel a veces trae \n). */
  function singleLineCode(s: string): string {
    return s.replace(/\r\n|\r|\n/g, ' ').trim()
  }

  function stockTotalValue(row: InventoryItem): string {
    if (row.averageCost == null || row.averageCost === '') return '—'
    const q = Number(row.quantityOnHand)
    const c = Number(row.averageCost)
    if (Number.isNaN(q) || Number.isNaN(c)) return '—'
    return Math.ceil(q * c - 1e-9).toLocaleString('es-CO', { maximumFractionDigits: 0 })
  }

  const itemsQuery = useQuery({
    queryKey: queryKeys.inventory.items(),
    queryFn: ({ signal }) => fetchInventoryItemsForQuery(signal),
    staleTime: STALE_INVENTORY_CATALOG_MS,
    gcTime: INVENTORY_QUERY_GC_MS,
  })
  const rows = itemsQuery.data ?? null

  const hiddenQuery = useQuery({
    queryKey: queryKeys.inventory.hiddenItems(),
    queryFn: ({ signal }) => fetchInventoryHiddenItemsForQuery(signal),
    enabled: hiddenDevEnabled && showStubDevTools,
    staleTime: STALE_INVENTORY_CATALOG_MS,
    gcTime: INVENTORY_QUERY_GC_MS,
  })
  const hiddenList = hiddenQuery.data
  const hiddenErr = hiddenQuery.isError ? 'No se pudieron cargar los SKU ocultos.' : null

  const unitsQuery = useQuery({
    queryKey: queryKeys.inventory.measurementUnits(),
    queryFn: ({ signal }) => fetchMeasurementUnitsForQuery(signal),
    staleTime: STALE_INVENTORY_CATALOG_MS,
    gcTime: INVENTORY_QUERY_GC_MS,
  })

  const invalidateInventoryLists = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.inventory.items() })
    await queryClient.invalidateQueries({ queryKey: queryKeys.inventory.oilDrumEconomics() })
    if (hiddenDevEnabled && showStubDevTools) {
      await queryClient.invalidateQueries({ queryKey: queryKeys.inventory.hiddenItems() })
    }
  }, [hiddenDevEnabled, queryClient, showStubDevTools])

  const toggleHiddenDev = useCallback(() => {
    const next = !hiddenDevEnabled
    setHiddenDevEnabled(next)
    setInventoryHiddenDevEnabled(next)
  }, [hiddenDevEnabled])

  useEffect(() => {
    if (itemsQuery.isError) {
      setErr(
        itemsQuery.error instanceof Error ? itemsQuery.error.message : 'No se pudo cargar el inventario',
      )
    } else {
      setErr(null)
    }
  }, [itemsQuery.isError, itemsQuery.error])

  useEffect(() => {
    const u = unitsQuery.data
    if (!u?.length) return
    setUnits(u)
    setSlug((s) => (u.some((x) => x.slug === s) ? s : u[0].slug))
  }, [unitsQuery.data])

  function openEdit(r: InventoryItem) {
    setEditItem(r)
    setEditName(r.name)
    setEditReference(r.reference ?? '')
    setEditSupplier(r.supplier ?? '')
    setEditCategory(r.category ?? '')
    setEditAvgCost(r.averageCost != null ? normalizeMoneyDecimalStringForApi(String(r.averageCost)) : '')
    setEditTrack(r.trackStock)
    setEditActive(r.isActive)
    setMsg(null)
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editItem) return
    setMsg(null)
    const costNorm = normalizeMoneyDecimalStringForApi(editAvgCost)
    if (editAvgCost.trim() && (!costNorm || !API_MONEY_DECIMAL_REGEX.test(costNorm))) {
      setMsg('Costo: solo pesos enteros; miles con punto, o dejá vacío.')
      return
    }
    try {
      await api(`/inventory/items/${editItem.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editName.trim(),
          reference: editReference.trim(),
          supplier: editSupplier.trim(),
          category: editCategory.trim(),
          averageCost: costNorm === '' ? null : costNorm,
          trackStock: editTrack,
          isActive: editActive,
        }),
      })
      setEditItem(null)
      await invalidateInventoryLists()
      setMsg('Ítem actualizado')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Error al guardar')
    }
  }

  async function deleteItem(row: InventoryItem) {
    const q = Number(row.quantityOnHand)
    if (!Number.isFinite(q) || q !== 0) return
    const ok = window.confirm(
      `¿Eliminar permanentemente el ítem ${singleLineCode(row.sku)}? Solo permitido si no tiene uso en OT, ventas u otros documentos.`,
    )
    if (!ok) return
    setMsg(null)
    try {
      await api(`/inventory/items/${row.id}`, { method: 'DELETE' })
      await invalidateInventoryLists()
      setMsg('Ítem eliminado')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'No se pudo borrar')
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
          reference: newReference.trim() || undefined,
          supplier: newSupplier.trim() || undefined,
          category: newCategory.trim() || undefined,
          measurementUnitSlug: slug,
          initialQuantity: initialQty.trim() || '0',
        }),
      })
      setOpen(false)
      setSku('')
      setName('')
      setNewReference('')
      setNewSupplier('')
      setNewCategory('')
      setInitialQty('0')
      await invalidateInventoryLists()
      setMsg('Ítem creado')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Error al crear')
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Repuestos e ítems"
        description="Catálogo con stock. El costo unitario es el promedio ponderado; el valor stock es cantidad × ese costo (útil para márgenes e informes)."
        actions={
          can('inventory_items:create') ? (
            <button type="button" onClick={() => setOpen(true)} className={createBtnClass}>
              Nuevo ítem
            </button>
          ) : null
        }
      />

      {showStubDevTools ? (
        <label className="flex cursor-pointer flex-wrap items-center gap-2 rounded-lg border border-dashed border-amber-400/70 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-700/70 dark:bg-amber-950/40 dark:text-amber-100">
          <input
            type="checkbox"
            checked={hiddenDevEnabled}
            onChange={toggleHiddenDev}
            className="rounded border-slate-300 dark:border-slate-500"
          />
          <span>
            Modo desarrollador: mostrar <strong>SKU ocultos</strong> (ítems desactivados en catálogo;
            <code className="mx-1 rounded bg-amber-100/80 px-1 font-mono text-xs dark:bg-amber-900/50">isActive=false</code>
            ). Podés borrarlos si stock es 0 y no tienen referencias en OT u otros documentos.
          </span>
        </label>
      ) : null}

      {err && (
        <p className="va-alert-error-lg">
          {err}
        </p>
      )}
      {msg && <p className="va-card-muted">{msg}</p>}

      {itemsQuery.isLoading && !itemsQuery.isError ? (
        <p className="text-slate-500 dark:text-slate-300">Cargando…</p>
      ) : null}

      {rows && (
        <div className={tableWrapClass}>
          {/*
            En móvil, table-fixed + w-full aplasta columnas; ancho mínimo + scroll horizontal evita solapamiento.
          */}
          <div className="overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]">
            <table className="va-table va-table-inv w-full min-w-[48rem]">
            <colgroup>
              <col className="w-[8%]" />
              <col className="w-[9%]" />
              <col className="w-[9%]" />
              <col className={showInvActionsCol ? 'w-[22%]' : 'w-[27%]'} />
              <col className="w-[10%]" />
              <col className="w-[7%]" />
              <col className="w-[6%]" />
              <col className="w-[11%]" />
              <col className="w-[10%]" />
              <col className="w-[4%]" />
              {showInvActionsCol ? <col className="w-[8%]" /> : null}
            </colgroup>
            <thead>
              <tr className="va-table-head-row">
                <th className="va-table-th min-w-0 whitespace-nowrap" title="SKU">
                  SKU
                </th>
                <th className="va-table-th min-w-0" title="Proveedor">
                  Prov.
                </th>
                <th className="va-table-th min-w-0" title="Categoría">
                  Cat.
                </th>
                <th className="va-table-th min-w-0" title="Nombre">
                  Nombre
                </th>
                <th className="va-table-th min-w-0" title="Referencia del fabricante / número de parte">
                  Referencia
                </th>
                <th className="va-table-th min-w-0" title="Unidad de medida">
                  Ud.
                </th>
                <th className="va-table-th min-w-0 text-right" title="Stock">
                  Stk
                </th>
                <th className="va-table-th min-w-0 text-right" title="Costo unitario promedio">
                  C. prom.
                </th>
                <th className="va-table-th min-w-0 text-right" title="Valor stock (cantidad × costo)">
                  Val. $
                </th>
                <th className="va-table-th min-w-0 text-center" title="Activo en catálogo">
                  Act.
                </th>
                {showInvActionsCol ? (
                  <th className="va-table-th min-w-0 text-right" title="Acciones">
                    Acciones
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const stockVal = stockTotalValue(r)
                const sup = r.supplier || '—'
                const cat = r.category || '—'
                return (
                  <tr key={r.id} className="va-table-body-row">
                    <td className="va-table-td min-w-0 whitespace-nowrap font-mono text-sm text-slate-600 dark:text-slate-300">
                      {singleLineCode(r.sku)}
                    </td>
                    <td className="va-table-td min-w-0 max-w-0 truncate text-slate-600 dark:text-slate-300" title={sup}>
                      {sup}
                    </td>
                    <td className="va-table-td min-w-0 max-w-0 truncate text-slate-600 dark:text-slate-300" title={cat}>
                      {cat}
                    </td>
                    <td
                      className="va-table-td min-w-0 max-w-0 truncate font-medium text-slate-900 dark:text-slate-50"
                      title={r.name}
                    >
                      {r.name}
                    </td>
                    <td
                      className="va-table-td min-w-0 max-w-0 truncate font-mono text-sm text-slate-600 dark:text-slate-300"
                      title={r.reference || ''}
                    >
                      {r.reference || '—'}
                    </td>
                    <td
                      className="va-table-td min-w-0 max-w-0 truncate text-slate-600 dark:text-slate-300"
                      title={r.measurementUnit.name}
                    >
                      {r.measurementUnit.name}
                    </td>
                    <td className="va-table-td whitespace-nowrap text-right font-mono text-sm text-slate-800 dark:text-slate-200">
                      {r.quantityOnHand}
                    </td>
                    <td className="va-table-td whitespace-nowrap text-right font-mono text-sm tabular-nums text-slate-700 dark:text-slate-200">
                      {r.averageCost != null && r.averageCost !== '' ? `$${formatMoney(r.averageCost)}` : '—'}
                    </td>
                    <td className="va-table-td whitespace-nowrap text-right font-mono text-sm tabular-nums text-slate-700 dark:text-slate-200">
                      {stockVal === '—' ? '—' : `$${stockVal}`}
                    </td>
                    <td className="va-table-td whitespace-nowrap text-center text-slate-600 dark:text-slate-300">
                      {r.isActive ? 'Sí' : 'No'}
                    </td>
                    {showInvActionsCol ? (
                      <td className="va-table-td min-w-0 !px-0 py-2 pr-1 text-right sm:pr-2">
                        <div className="flex flex-wrap justify-end gap-1">
                          {showInvActions ? (
                            <button
                              type="button"
                              onClick={() => openEdit(r)}
                              className="inline-flex rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                            >
                              Editar
                            </button>
                          ) : null}
                          {showInvDelete ? (
                            <button
                              type="button"
                              title={
                                Number(r.quantityOnHand) !== 0
                                  ? 'Solo se puede borrar con stock en cero'
                                  : 'Eliminar si no está usado en OT, ventas, compras, etc.'
                              }
                              disabled={Number(r.quantityOnHand) !== 0}
                              onClick={() => deleteItem(r)}
                              className="inline-flex rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-red-900/60 dark:text-red-400 dark:hover:bg-red-950/40"
                            >
                              Borrar
                            </button>
                          ) : null}
                        </div>
                      </td>
                    ) : null}
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {hiddenDevEnabled && showStubDevTools ? (
        <div className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            SKU ocultos (desarrollo)
          </h2>
          {hiddenErr ? <p className="va-alert-error-lg">{hiddenErr}</p> : null}
          {hiddenQuery.isPending && hiddenList === undefined && !hiddenErr ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Cargando…</p>
          ) : null}
          {hiddenList && hiddenList.length === 0 ? (
            <p className="text-sm text-slate-600 dark:text-slate-400">
              No hay ítems inactivos en catálogo.
            </p>
          ) : null}
          {hiddenList && hiddenList.length > 0 ? (
            <div className={tableWrapClass}>
              <div className="overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]">
                <table className="va-table va-table-inv w-full min-w-[42rem]">
                  <thead>
                    <tr className="va-table-head-row">
                      <th className="va-table-th font-mono">SKU</th>
                      <th className="va-table-th">Nombre</th>
                      <th className="va-table-th text-right">Stock</th>
                      {showInvDelete ? (
                        <th className="va-table-th text-right">Acciones</th>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody>
                    {hiddenList.map((r) => (
                      <tr key={r.id} className="va-table-body-row">
                        <td className="va-table-td font-mono text-sm">{singleLineCode(r.sku)}</td>
                        <td className="va-table-td">{r.name}</td>
                        <td className="va-table-td text-right tabular-nums">{r.quantityOnHand}</td>
                        {showInvDelete ? (
                          <td className="va-table-td text-right">
                            <button
                              type="button"
                              title={
                                Number(r.quantityOnHand) !== 0
                                  ? 'Solo se puede borrar con stock en cero'
                                  : 'Eliminar si no está en líneas de cotización u otros documentos'
                              }
                              disabled={Number(r.quantityOnHand) !== 0}
                              onClick={() => deleteItem(r)}
                              className="inline-flex rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-red-900/60 dark:text-red-400 dark:hover:bg-red-950/40"
                            >
                              Borrar
                            </button>
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {editItem && (
        <div className="va-modal-overlay" role="presentation">
          <div
            className="va-modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-item-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="edit-item-title" className="va-section-title">
              Editar ítem
            </h2>
            <p className="mt-1 font-mono text-xs text-slate-500 dark:text-slate-300">{editItem.sku}</p>
            <form className="mt-4 space-y-3" onSubmit={saveEdit}>
              <label className="block text-sm">
                <span className="va-label">Proveedor</span>
                <input
                  value={editSupplier}
                  onChange={(e) => setEditSupplier(e.target.value)}
                  maxLength={200}
                  className="va-field mt-1"
                />
              </label>
              <label className="block text-sm">
                <span className="va-label">Categoría</span>
                <input
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value)}
                  maxLength={200}
                  className="va-field mt-1"
                />
              </label>
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
                <span className="va-label">Referencia (nº de parte, opcional)</span>
                <input
                  value={editReference}
                  onChange={(e) => setEditReference(e.target.value)}
                  maxLength={120}
                  placeholder="Ej. # 00, K-2015"
                  className="va-field mt-1 font-mono"
                />
              </label>
              <label className="block text-sm">
                <span className="va-label">Costo unitario promedio (vacío = sin costo)</span>
                <input
                  inputMode="decimal"
                  autoComplete="off"
                  value={formatMoneyInputDisplayFromNormalized(normalizeMoneyDecimalStringForApi(editAvgCost))}
                  onChange={(e) => setEditAvgCost(normalizeMoneyDecimalStringForApi(e.target.value))}
                  className="va-field mt-1"
                />
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
                <button type="submit" className="va-btn-primary">
                  Guardar
                </button>
                <button type="button" onClick={() => setEditItem(null)} className="va-btn-secondary">
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {open && (
        <div className="va-modal-overlay" role="presentation">
          <div
            className="va-modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-item-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="new-item-title" className="va-section-title">
              Nuevo ítem
            </h2>
            <form className="mt-4 space-y-3" onSubmit={createItem}>
              <label className="block text-sm">
                <span className="va-label">SKU</span>
                <input required value={sku} onChange={(e) => setSku(e.target.value)} className="va-field mt-1" />
              </label>
              <label className="block text-sm">
                <span className="va-label">Proveedor (opcional)</span>
                <input
                  value={newSupplier}
                  onChange={(e) => setNewSupplier(e.target.value)}
                  maxLength={200}
                  className="va-field mt-1"
                />
              </label>
              <label className="block text-sm">
                <span className="va-label">Categoría (opcional)</span>
                <input
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  maxLength={200}
                  className="va-field mt-1"
                />
              </label>
              <label className="block text-sm">
                <span className="va-label">Nombre</span>
                <input required value={name} onChange={(e) => setName(e.target.value)} className="va-field mt-1" />
              </label>
              <label className="block text-sm">
                <span className="va-label">Referencia (nº de parte, opcional)</span>
                <input
                  value={newReference}
                  onChange={(e) => setNewReference(e.target.value)}
                  maxLength={120}
                  placeholder="Ej. # 00, K-2015"
                  className="va-field mt-1 font-mono"
                />
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
                <button type="submit" className="va-btn-primary">
                  Crear
                </button>
                <button type="button" onClick={() => setOpen(false)} className="va-btn-secondary">
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
