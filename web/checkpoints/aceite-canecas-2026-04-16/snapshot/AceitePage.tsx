import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { OilDrumGauge } from '../components/aceite/OilDrumGauge'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import type { InventoryItem } from '../api/types'
import { inventoryItemIsOilDrum55Gallon, OIL_DRUM_CATEGORY_HINT } from '../utils/oilDrumInventory'

/** Una caneca en la imagen = esta cantidad en la unidad del ítem (p. ej. 55 gal). */
const DRUM_REFERENCE_QTY = 55

function oilDrumItemStockRatio(item: InventoryItem): number {
  const q = Number(item.quantityOnHand)
  if (!Number.isFinite(q) || q < 0) return 0
  return Math.min(1, q / DRUM_REFERENCE_QTY)
}

function formatQtyDisplay(q: string): string {
  const n = Number(q)
  if (!Number.isFinite(n)) return q
  return n.toLocaleString('es-CO', { maximumFractionDigits: 4 })
}

export function AceitePage() {
  const { can } = useAuth()
  const canEditInv = can('inventory_items:update')
  const [rows, setRows] = useState<InventoryItem[] | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await api<InventoryItem[]>('/inventory/items')
        if (!cancelled) setRows(data)
      } catch {
        if (!cancelled) setErr('No se pudo cargar el inventario')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const oilRows = useMemo(() => {
    if (!rows) return []
    return rows.filter((r) => r.isActive && inventoryItemIsOilDrum55Gallon(r)).sort((a, b) => a.sku.localeCompare(b.sku))
  }, [rows])

  const unitSummary = useMemo(() => {
    const bySlug = new Map<string, { name: string; sum: number }>()
    for (const r of oilRows) {
      const slug = r.measurementUnit.slug
      const prev = bySlug.get(slug) ?? { name: r.measurementUnit.name, sum: 0 }
      const q = Number(r.quantityOnHand)
      prev.sum += Number.isFinite(q) ? q : 0
      bySlug.set(slug, prev)
    }
    return [...bySlug.entries()].map(([slug, v]) => ({ slug, ...v }))
  }, [oilRows])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">Aceite</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600 dark:text-slate-400">
          Seguimiento de <strong className="font-medium text-slate-800 dark:text-slate-200">cantidades en stock</strong>{' '}
          de aceites que manejás en <strong className="font-medium text-slate-800 dark:text-slate-200">caneca o tambor de 55 galones</strong>{' '}
          (u otro bulto grande equivalente). Los datos vienen del mismo inventario que{' '}
          <Link to="/inventario" className="font-medium text-brand-700 underline hover:text-brand-800 dark:text-brand-300">
            Repuestos
          </Link>
          .
        </p>
        <p className="mt-2 max-w-3xl rounded-xl border border-slate-200/90 bg-slate-50/90 px-3 py-2 text-xs leading-relaxed text-slate-700 dark:border-slate-600 dark:bg-slate-900/50 dark:text-slate-300">
          <span className="font-semibold text-slate-900 dark:text-slate-100">Cómo suma un ítem a esta lista:</span>{' '}
          en categoría, nombre o SKU debe figurar algo de aceite/lubricante <em>y</em> algo que indique el bulto grande
          (p. ej. <span className="font-mono">55</span>, <span className="font-mono">galón</span>,{' '}
          <span className="font-mono">caneca</span>, <span className="font-mono">tambor</span>, <span className="font-mono">208l</span>).
          Categoría sugerida al alta: <span className="font-mono text-[11px]">{OIL_DRUM_CATEGORY_HINT}</span>.
        </p>
      </div>

      {err && <p className="va-alert-error-block">{err}</p>}

      {rows && oilRows.length === 0 && !err ? (
        <div className="va-card">
          <p className="text-sm text-slate-700 dark:text-slate-200">
            No hay ítems activos que coincidan con el criterio de aceite en caneca/tambor 55 gal. Revisá nombres y
            categorías en Repuestos o creá uno nuevo con la categoría sugerida arriba.
          </p>
          <div className="mt-4">
            <Link
              to="/inventario"
              className="inline-flex rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
            >
              Ir a Repuestos
            </Link>
          </div>
        </div>
      ) : null}

      {oilRows.length > 0 ? (
        <>
          <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-slate-50/70 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/45 sm:p-5">
            <h2 className="text-center text-sm font-semibold text-slate-800 dark:text-slate-100">
              Nivel por ítem (1 caneca en imagen = {DRUM_REFERENCE_QTY.toLocaleString('es-CO')} en la unidad de cada producto)
            </h2>
            <p className="mx-auto mt-1 max-w-2xl text-center text-xs leading-relaxed text-slate-600 dark:text-slate-400">
              Hay <strong className="font-medium text-slate-800 dark:text-slate-200">una caneca por cada fila</strong> de aceite en caneca;
              mismas imágenes, máscara y animación que en una sola. El <strong className="font-medium text-slate-800 dark:text-slate-200">100 %</strong>{' '}
              del dibujo de cada una son {DRUM_REFERENCE_QTY.toLocaleString('es-CO')} en su unidad (p. ej. galones US). Si el stock supera
              esa referencia, el dibujo de ese ítem queda al tope; el detalle numérico va bajo cada caneca. Al entrar, la llena y luego el
              recorte baja al nivel real con borde levemente ondulado.
            </p>
            <div className="mx-auto mt-5 max-w-5xl px-5 sm:px-10 lg:px-14">
              <div className="grid grid-cols-1 justify-items-center gap-x-12 gap-y-14 sm:grid-cols-2 sm:gap-x-16 sm:gap-y-16 xl:grid-cols-3 xl:gap-x-20">
              {oilRows.map((r) => {
                const ratio = oilDrumItemStockRatio(r)
                const q = Number(r.quantityOnHand)
                const qty = Number.isFinite(q) && q >= 0 ? q : 0
                const eq = qty / DRUM_REFERENCE_QTY
                return (
                  <div
                    key={r.id}
                    className="flex w-full max-w-[11.5rem] flex-col items-center sm:max-w-[12.5rem]"
                  >
                    <div className="w-full">
                      <OilDrumGauge stockRatio={ratio} />
                    </div>
                    <p className="mt-3 w-full px-0.5 text-center text-xs font-medium leading-snug text-slate-800 dark:text-slate-100">
                      {r.name}
                    </p>
                    <p className="mt-1 w-full text-center font-mono text-[11px] tabular-nums leading-relaxed text-slate-600 dark:text-slate-400">
                      {qty.toLocaleString('es-CO', { maximumFractionDigits: 4 })} {r.measurementUnit.name}
                      {' · '}
                      {(ratio * 100).toFixed(1)} % caneca
                      {eq > 0
                        ? ` · Equiv. ${eq.toLocaleString('es-CO', { maximumFractionDigits: 2 })} caneca(s)`
                        : null}
                    </p>
                  </div>
                )
              })}
              </div>
            </div>
          </section>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {unitSummary.map((u) => (
              <div key={u.slug} className="va-card !p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Total stock ({u.name})
                </p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-50">
                  {u.sum.toLocaleString('es-CO', { maximumFractionDigits: 4 })}
                </p>
              </div>
            ))}
          </div>

          <section className="va-card-flush overflow-hidden">
            <div className="border-b border-slate-100 px-4 py-3 sm:px-6 dark:border-slate-800">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Por ítem</h2>
              <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                Cantidad actual según inventario (misma fuente que Repuestos).
              </p>
            </div>
            <div className="va-table-scroll">
              <table className="va-table min-w-[640px]">
                <thead>
                  <tr className="va-table-head-row">
                    <th className="va-table-th">SKU</th>
                    <th className="va-table-th">Nombre</th>
                    <th className="va-table-th">Categoría</th>
                    <th className="va-table-th">Unidad</th>
                    <th className="va-table-th">Cantidad</th>
                    <th className="va-table-th">Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {oilRows.map((r) => (
                    <tr key={r.id} className="va-table-body-row">
                      <td className="va-table-td font-mono text-xs text-slate-600 dark:text-slate-300">{r.sku}</td>
                      <td className="va-table-td text-sm font-medium text-slate-900 dark:text-slate-50">{r.name}</td>
                      <td className="va-table-td text-sm text-slate-600 dark:text-slate-300">
                        {(r.category ?? '').trim() || '—'}
                      </td>
                      <td className="va-table-td text-sm text-slate-600 dark:text-slate-300">{r.measurementUnit.name}</td>
                      <td className="va-table-td font-mono text-sm tabular-nums text-slate-800 dark:text-slate-200">
                        {formatQtyDisplay(r.quantityOnHand)}
                      </td>
                      <td className="va-table-td text-sm">
                        {r.trackStock ? (
                          <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-100">
                            Descontable
                          </span>
                        ) : (
                          <span className="text-slate-500 dark:text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {canEditInv ? (
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Para <strong className="font-medium text-slate-800 dark:text-slate-200">ajustar costos, unidad o cantidad inicial</strong>, usá{' '}
              <Link to="/inventario" className="font-medium text-brand-700 underline dark:text-brand-300">
                Repuestos
              </Link>
              . Las salidas por órdenes de trabajo siguen descontando desde allí.
            </p>
          ) : null}
        </>
      ) : null}

      {rows === null && !err ? <p className="text-slate-500">Cargando…</p> : null}
    </div>
  )
}
