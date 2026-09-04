import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { OilDrumGauge } from '../components/aceite/OilDrumGauge'
import { useAuth } from '../auth/AuthContext'
import { panelUsesModernShell } from '../config/operationalNotes'
import { STALE_INVENTORY_CATALOG_MS } from '../constants/queryStaleTime'
import { portalPath } from '../constants/portalPath'
import {
  fetchInventoryItemsForQuery,
  fetchOilDrumEconomicsForQuery,
} from '../features/inventory/services/inventoryCatalogApi'
import { queryKeys } from '../lib/queryKeys'
import { PageHeader } from '../components/layout/PageHeader'
import { usePanelTheme } from '../theme/PanelThemeProvider'
import type { InventoryItem, OilDrumEconomicsItem } from '../api/types'
import { formatCopFromString } from '../utils/copFormat'
import { inventoryItemIsOilDrum55Gallon, OIL_DRUM_CATEGORY_HINT } from '../services/inventory/oilDrumInventory'

const INVENTORY_QUERY_GC_MS = 20 * 60_000

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

function paymentSourceLabel(src: string): string {
  if (src === 'CASH_REGISTER') return 'Efectivo desde caja'
  if (src === 'BANK_TRANSFER') return 'Transferencia / banco'
  return src
}

function formatCopCell(s: string | null | undefined): string {
  if (s == null || s === '') return '—'
  return `$${formatCopFromString(s)}`
}

function formatShortDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('es-CO', { dateStyle: 'short' })
}

function pctClamp(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.min(100, n)
}

function PaymentPill({ src }: { src: string }) {
  const bank = src === 'BANK_TRANSFER'
  return (
    <span
      className={
        bank
          ? 'rounded-md bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-900 dark:bg-sky-900/50 dark:text-sky-100'
          : 'rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-950 dark:bg-amber-900/45 dark:text-amber-50'
      }
      title={paymentSourceLabel(src)}
    >
      {bank ? 'Banco' : 'Caja'}
    </span>
  )
}

function ThinBar({
  pct,
  tone = 'brand',
}: {
  pct: number
  tone?: 'brand' | 'emerald' | 'amber' | 'rose'
}) {
  const toneClass =
    tone === 'emerald'
      ? 'bg-emerald-500 dark:bg-emerald-400'
      : tone === 'amber'
        ? 'bg-amber-500 dark:bg-amber-400'
        : tone === 'rose'
          ? 'bg-rose-500 dark:bg-rose-400'
          : 'bg-brand-600 dark:bg-brand-400'
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-slate-200/90 dark:bg-slate-700/90"
      title={`${pctClamp(pct).toFixed(0)} %`}
    >
      <div className={`h-full rounded-full ${toneClass}`} style={{ width: `${pctClamp(pct)}%` }} />
    </div>
  )
}

function OilEconomicsCard({
  row,
  showOtMargin,
}: {
  row: OilDrumEconomicsItem
  showOtMargin: boolean
}) {
  const isSaas = panelUsesModernShell(usePanelTheme())
  const lp = row.lastPurchase
  const wo = row.workOrderPart
  const qHand = Number(row.quantityOnHand)
  const qBuy = lp ? Number(lp.quantity) : NaN
  const stockVsBuyPct =
    Number.isFinite(qHand) && Number.isFinite(qBuy) && qBuy > 0 ? (qHand / qBuy) * 100 : 0

  const rev = wo ? Number(wo.revenueCop) : NaN
  const mar = wo?.approximateMarginCop != null ? Number(wo.approximateMarginCop) : NaN
  const marginOfRevPct = Number.isFinite(rev) && rev > 0 && Number.isFinite(mar) ? (mar / rev) * 100 : 0
  const costOfRevPct =
    Number.isFinite(rev) && rev > 0 && wo?.approximateCostAtAverageCop != null
      ? (Number(wo.approximateCostAtAverageCop) / rev) * 100
      : 0

  const marginTone =
    Number.isFinite(mar) && mar < 0
      ? 'text-rose-700 dark:text-rose-300'
      : Number.isFinite(mar)
        ? 'text-emerald-700 dark:text-emerald-300'
        : 'text-slate-600 dark:text-slate-300'

  return (
    <article
      className={
        isSaas
          ? 'rounded-xl border border-slate-200/85 bg-[var(--va-surface-elevated)] p-3 shadow-sm dark:border-slate-700/80 dark:bg-slate-900'
          : 'rounded-xl border border-slate-200/90 bg-white/90 p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900/60'
      }
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="va-section-title truncate text-sm">{row.name}</h3>
          <p className="truncate font-mono text-[10px] text-slate-500 dark:text-slate-300">{row.sku}</p>
        </div>
        {lp ? (
          <div className="flex shrink-0 flex-col items-end gap-1">
            <span className="text-[10px] font-medium tabular-nums text-slate-500 dark:text-slate-300">
              {formatShortDate(lp.receivedAt)}
            </span>
            <PaymentPill src={lp.paymentSource} />
          </div>
        ) : null}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-slate-50 px-2 py-1.5 dark:bg-slate-800/80">
          <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">
            Últ. compra
          </p>
          <p className="mt-0.5 font-mono text-xs font-semibold tabular-nums text-slate-900 dark:text-slate-50">
            {lp ? formatCopCell(lp.totalPaidCop) : '—'}
          </p>
        </div>
        <div className="rounded-lg bg-slate-50 px-2 py-1.5 dark:bg-slate-800/80">
          <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">
            Stock valorizado
          </p>
          <p className="mt-0.5 font-mono text-xs font-semibold tabular-nums text-slate-900 dark:text-slate-50">
            {formatCopCell(row.stockAtAverageCostCop)}
          </p>
        </div>
      </div>

      {lp && Number.isFinite(stockVsBuyPct) && qBuy > 0 ? (
        <div className="mt-2">
          <div className="mb-0.5 flex justify-between text-[9px] text-slate-500 dark:text-slate-300">
            <span>Stock / cant. últ. compra</span>
            <span className="tabular-nums">{pctClamp(stockVsBuyPct).toFixed(0)}%</span>
          </div>
          <ThinBar pct={stockVsBuyPct} tone="amber" />
        </div>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-slate-500 dark:text-slate-300">
        <span className="tabular-nums">c/u {formatCopCell(row.averageCost)}</span>
        {lp ? (
          <span className="tabular-nums">
            · {formatQtyDisplay(lp.quantity)} {row.measurementUnit.name}
          </span>
        ) : null}
      </div>

      {showOtMargin && wo && Number.isFinite(rev) && rev > 0 ? (
        <div className="mt-3 border-t border-slate-100 pt-2 dark:border-slate-700/80">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[9px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">
              OT · facturación
            </span>
            <span className="font-mono text-[11px] font-semibold tabular-nums text-slate-800 dark:text-slate-100">
              {formatCopCell(wo.revenueCop)}
            </span>
          </div>
          {Number.isFinite(costOfRevPct) && costOfRevPct > 0 ? (
            <div className="mt-1.5">
              <div className="mb-0.5 flex justify-between text-[9px] text-slate-500 dark:text-slate-300">
                <span>Costo ref. / fact.</span>
                <span className="tabular-nums">{pctClamp(costOfRevPct).toFixed(0)}%</span>
              </div>
              <ThinBar pct={costOfRevPct} tone="amber" />
            </div>
          ) : null}
          {Number.isFinite(marginOfRevPct) && wo.approximateMarginCop != null ? (
            <div className="mt-1.5">
              <div className="mb-0.5 flex justify-between text-[9px] text-slate-500 dark:text-slate-300">
                <span>Margen aprox. / fact.</span>
                <span className={`tabular-nums font-medium ${marginTone}`}>
                  {formatCopCell(wo.approximateMarginCop)}
                </span>
              </div>
              <ThinBar
                pct={marginOfRevPct}
                tone={Number.isFinite(mar) && mar < 0 ? 'rose' : 'emerald'}
              />
            </div>
          ) : (
            <p className="mt-1 text-[9px] text-slate-500 dark:text-slate-300">Margen: sin costo medio.</p>
          )}
        </div>
      ) : null}
    </article>
  )
}

export function AceitePage() {
  const panelTheme = usePanelTheme()
  const isSaas = panelUsesModernShell(panelTheme)
  const { can } = useAuth()
  const canEditInv = can('inventory_items:update')

  const itemsQuery = useQuery({
    queryKey: queryKeys.inventory.items(),
    queryFn: ({ signal }) => fetchInventoryItemsForQuery(signal),
    staleTime: STALE_INVENTORY_CATALOG_MS,
    gcTime: INVENTORY_QUERY_GC_MS,
  })
  const rows = itemsQuery.data ?? null
  const err = itemsQuery.isError
    ? itemsQuery.error instanceof Error
      ? itemsQuery.error.message
      : 'No se pudo cargar el inventario'
    : null

  const oilRows = useMemo(() => {
    if (!rows) return []
    return rows.filter((r) => r.isActive && inventoryItemIsOilDrum55Gallon(r)).sort((a, b) => a.sku.localeCompare(b.sku))
  }, [rows])

  const ecoQuery = useQuery({
    queryKey: queryKeys.inventory.oilDrumEconomics(),
    queryFn: ({ signal }) => fetchOilDrumEconomicsForQuery(signal),
    enabled: oilRows.length > 0,
    staleTime: STALE_INVENTORY_CATALOG_MS,
    gcTime: INVENTORY_QUERY_GC_MS,
  })
  const eco = ecoQuery.data ?? null

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
  const emptyCardClass = isSaas ? 'va-saas-page-section' : 'va-card'
  const moduleSectionClass = isSaas
    ? 'va-saas-page-section'
    : 'rounded-2xl border border-slate-200/90 bg-gradient-to-b from-slate-50/80 to-white/90 p-3 shadow-sm dark:border-slate-700 dark:from-slate-900/50 dark:to-slate-900/30 sm:p-4'

  return (
    <div className="space-y-6">
      <PageHeader
        title="Aceite"
        description={
          <>
            <p className="max-w-3xl text-slate-600 dark:text-slate-300">
              Seguimiento de <strong className="font-medium text-slate-800 dark:text-slate-200">cantidades en stock</strong>{' '}
              de aceites que manejás en{' '}
              <strong className="font-medium text-slate-800 dark:text-slate-200">caneca o tambor de 55 galones</strong>{' '}
              (u otro bulto grande equivalente). Los datos vienen del mismo inventario que{' '}
              <Link to={portalPath('/inventario')} className="font-medium text-brand-700 underline hover:text-brand-800 dark:text-brand-300">
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
          </>
        }
      />

      {err && <p className="va-alert-error-block">{err}</p>}

      {rows && oilRows.length === 0 && !err ? (
        <div className={emptyCardClass}>
          <p className="text-sm text-slate-700 dark:text-slate-200">
            No hay ítems activos que coincidan con el criterio de aceite en caneca/tambor 55 gal. Revisá nombres y
            categorías en Repuestos o creá uno nuevo con la categoría sugerida arriba.
          </p>
          <div className="mt-4">
            <Link
              to={portalPath('/inventario')}
              className="va-btn-primary inline-flex"
            >
              Ir a Repuestos
            </Link>
          </div>
        </div>
      ) : null}

      {oilRows.length > 0 ? (
        <>
          {eco && eco.items.length > 0 ? (
            <section className={moduleSectionClass}>
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h2 className="va-section-title">Costos · última compra · OT</h2>
                  <p className="text-[11px] text-slate-500 dark:text-slate-300">Vista compacta; valores aprox.</p>
                </div>
                <details className="text-[11px] text-slate-500 dark:text-slate-300">
                  <summary className="cursor-pointer select-none font-medium text-brand-700 hover:underline dark:text-brand-300">
                    Nota metodológica
                  </summary>
                  <p className="mt-2 max-w-md leading-relaxed">
                    El margen en OT usa el <strong className="font-medium text-slate-700 dark:text-slate-300">costo
                    medio actual</strong>, no el costo histórico por lote. Las barras comparan magnitudes (stock vs
                    última compra, costo vs facturación) para orientación visual.
                  </p>
                </details>
              </div>
              {!eco.flags.includesPurchaseSnapshot ? (
                <p className="mt-3 rounded-lg border border-amber-200/80 bg-amber-50/90 px-3 py-2 text-xs text-amber-950 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-100">
                  Sin permiso para ver montos de compra / costo medio. Pedí acceso a compras o edición de inventario.
                </p>
              ) : (
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {eco.items
                    .slice()
                    .sort((a, b) => a.sku.localeCompare(b.sku))
                    .map((row) => (
                      <OilEconomicsCard
                        key={row.inventoryItemId}
                        row={row}
                        showOtMargin={eco.flags.includesOtApproxMargin}
                      />
                    ))}
                </div>
              )}
            </section>
          ) : null}

          <section className={`${moduleSectionClass} overflow-hidden`}>
            <div className="text-center">
              <h2 className="va-section-title text-sm">
                Nivel por ítem · referencia {DRUM_REFERENCE_QTY.toLocaleString('es-CO')} {oilRows[0]?.measurementUnit.name ?? 'u.'}{' '}
                / caneca
              </h2>
              <details className="mx-auto mt-1 inline-block text-left text-[11px] text-slate-500 dark:text-slate-300">
                <summary className="cursor-pointer list-none text-center font-medium text-brand-700 hover:underline dark:text-brand-300 [&::-webkit-details-marker]:hidden">
                  Cómo se lee el dibujo
                </summary>
                <p className="mx-auto mt-2 max-w-lg leading-relaxed">
                  Una caneca por fila; el 100 % del dibujo equivale a {DRUM_REFERENCE_QTY.toLocaleString('es-CO')} en la
                  unidad del ítem. Si el stock supera eso, el dibujo queda lleno. Al cargar, anima al nivel real.
                </p>
              </details>
            </div>
            <div className="mx-auto mt-4 max-w-5xl px-3 sm:px-8 lg:px-12">
              <div className="grid grid-cols-1 justify-items-center gap-x-10 gap-y-10 sm:grid-cols-2 sm:gap-x-12 sm:gap-y-12 xl:grid-cols-3 xl:gap-x-16">
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
                    <p className="mt-1 w-full text-center font-mono text-[11px] tabular-nums leading-relaxed text-slate-600 dark:text-slate-300">
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
              <div
                key={u.slug}
                className={isSaas ? 'va-saas-page-section !p-4' : 'va-card !p-4'}
              >
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-300">
                  Total stock ({u.name})
                </p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-50">
                  {u.sum.toLocaleString('es-CO', { maximumFractionDigits: 4 })}
                </p>
              </div>
            ))}
          </div>

          <section className="va-saas-soft-panel">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Detalle por ítem</h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-300">Misma fuente que Repuestos.</p>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {oilRows.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-col gap-1 rounded-lg border border-slate-100 bg-slate-50/80 px-2.5 py-2 dark:border-slate-700/80 dark:bg-slate-800/50"
                >
                  <p className="truncate text-xs font-semibold text-slate-900 dark:text-slate-50">{r.name}</p>
                  <p className="font-mono text-[10px] text-slate-500 dark:text-slate-300">{r.sku}</p>
                  <div className="flex flex-wrap items-baseline justify-between gap-1 border-t border-slate-200/80 pt-1.5 dark:border-slate-600/60">
                    <span className="font-mono text-sm font-semibold tabular-nums text-slate-800 dark:text-slate-100">
                      {formatQtyDisplay(r.quantityOnHand)}{' '}
                      <span className="text-[10px] font-normal text-slate-500">{r.measurementUnit.name}</span>
                    </span>
                    {r.trackStock ? (
                      <span className="shrink-0 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-200">
                        Stock
                      </span>
                    ) : null}
                  </div>
                  {(r.category ?? '').trim() ? (
                    <p className="truncate text-[10px] text-slate-500 dark:text-slate-300">{r.category}</p>
                  ) : null}
                </div>
              ))}
            </div>
          </section>

          {canEditInv ? (
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Para <strong className="font-medium text-slate-800 dark:text-slate-200">ajustar costos, unidad o cantidad inicial</strong>, usá{' '}
              <Link to={portalPath('/inventario')} className="font-medium text-brand-700 underline dark:text-brand-300">
                Repuestos
              </Link>
              . Las salidas por órdenes de trabajo siguen descontando desde allí.
            </p>
          ) : null}
        </>
      ) : null}

      {itemsQuery.isLoading && !err ? <p className="text-slate-500">Cargando…</p> : null}
    </div>
  )
}
