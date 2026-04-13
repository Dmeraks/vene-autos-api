import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../api/client'

type Granularity = 'day' | 'week' | 'fortnight' | 'month'

type SeriesRow = {
  periodKey: string
  periodLabel: string
  incomeTotal: string
  expenseTotal: string
  netCash: string
  otPaymentsTotal: string
  workOrdersOpened: number
  workOrdersDelivered: number
  distinctVehiclesTouched: number
}

type EconomicSummary = {
  from: string
  to: string
  granularity: Granularity
  disclaimer: string
  series: SeriesRow[]
  totals: {
    incomeTotal: string
    expenseTotal: string
    otPaymentsTotal: string
    netCash: string
    workOrdersOpened: number
    workOrdersDelivered: number
    distinctVehiclesTouched: number
  }
}

function ymdUtc(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function addDaysUtc(d: Date, days: number): Date {
  const x = new Date(d.getTime())
  x.setUTCDate(x.getUTCDate() + days)
  return x
}

function parseUtcYmd(ymd: string): Date {
  return new Date(Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)) - 1, Number(ymd.slice(8, 10))))
}

/** Inclusive day count between two YYYY-MM-DD (UTC calendar dates). */
function daysInclusiveUtc(fromYmd: string, toYmd: string): number {
  const a = parseUtcYmd(fromYmd).getTime()
  const b = parseUtcYmd(toYmd).getTime()
  return Math.floor((b - a) / 86_400_000) + 1
}

/** Same number of days as [from, to], ending the day before `from`. */
function previousSameLengthRange(from: string, to: string): { from: string; to: string } {
  const n = daysInclusiveUtc(from, to)
  const fromD = parseUtcYmd(from)
  const compareTo = addDaysUtc(fromD, -1)
  const compareFrom = addDaysUtc(compareTo, -(n - 1))
  return { from: ymdUtc(compareFrom), to: ymdUtc(compareTo) }
}

/** Full calendar month UTC immediately before the month of `boundaryFrom`. */
function previousFullMonthUtc(boundaryFrom: string): { from: string; to: string } {
  const d = parseUtcYmd(boundaryFrom)
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth()
  const firstThis = new Date(Date.UTC(y, m, 1))
  const lastPrev = addDaysUtc(firstThis, -1)
  const y2 = lastPrev.getUTCFullYear()
  const m2 = lastPrev.getUTCMonth()
  const firstPrev = new Date(Date.UTC(y2, m2, 1))
  const lastDay = new Date(Date.UTC(y2, m2 + 1, 0)).getUTCDate()
  const endPrev = new Date(Date.UTC(y2, m2, lastDay))
  return { from: ymdUtc(firstPrev), to: ymdUtc(endPrev) }
}

type Preset = { id: string; label: string; range: () => { from: string; to: string } }

const PRESETS: Preset[] = [
  {
    id: '7d',
    label: 'Últimos 7 días',
    range: () => {
      const to = new Date()
      const from = addDaysUtc(to, -6)
      return { from: ymdUtc(from), to: ymdUtc(to) }
    },
  },
  {
    id: '30d',
    label: 'Últimos 30 días',
    range: () => {
      const to = new Date()
      const from = addDaysUtc(to, -29)
      return { from: ymdUtc(from), to: ymdUtc(to) }
    },
  },
  {
    id: 'week',
    label: 'Esta semana (lun–dom UTC)',
    range: () => {
      const to = new Date()
      const dow = (to.getUTCDay() + 6) % 7
      const from = addDaysUtc(to, -dow)
      return { from: ymdUtc(from), to: ymdUtc(to) }
    },
  },
  {
    id: 'fortnight',
    label: 'Quincena calendario (mitad actual)',
    range: () => {
      const to = new Date()
      const y = to.getUTCFullYear()
      const m = to.getUTCMonth()
      const d = to.getUTCDate()
      const startDay = d <= 15 ? 1 : 16
      const from = new Date(Date.UTC(y, m, startDay, 0, 0, 0, 0))
      const last = d <= 15 ? 15 : new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
      const end = new Date(Date.UTC(y, m, last, 23, 59, 59, 999))
      return { from: ymdUtc(from), to: ymdUtc(end) }
    },
  },
  {
    id: 'month',
    label: 'Este mes (calendario UTC)',
    range: () => {
      const to = new Date()
      const y = to.getUTCFullYear()
      const m = to.getUTCMonth()
      const from = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0))
      const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
      const end = new Date(Date.UTC(y, m, last, 23, 59, 59, 999))
      return { from: ymdUtc(from), to: ymdUtc(end) }
    },
  },
]

type PresetId = (typeof PRESETS)[number]['id'] | 'custom'

const GRANULARITY_OPTIONS: { value: Granularity; label: string }[] = [
  { value: 'day', label: 'Diario' },
  { value: 'week', label: 'Semanal' },
  { value: 'fortnight', label: 'Quincenal' },
  { value: 'month', label: 'Mensual' },
]

function moneyEs(n: string): string {
  const x = Number.parseFloat(n)
  if (Number.isNaN(x)) return n
  return x.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
}

function pctDeltaVsRef(current: number, ref: number): string {
  if (ref === 0) return current === 0 ? '—' : 'nuevo'
  const p = ((current - ref) / Math.abs(ref)) * 100
  const s = p >= 0 ? '+' : ''
  return `${s}${p.toFixed(1)}%`
}

function BarChart({
  rows,
  getNumeric,
  format,
  label,
  color,
}: {
  rows: SeriesRow[]
  getNumeric: (r: SeriesRow) => number
  format: (r: SeriesRow) => string
  label: string
  color: string
}) {
  const nums = rows.map(getNumeric)
  const max = Math.max(1e-6, ...nums.map((n) => Math.abs(n)))
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
      <div className="space-y-2">
        {rows.map((r) => {
          const v = getNumeric(r)
          const w = Math.min(100, (Math.abs(v) / max) * 100)
          return (
            <div key={r.periodKey + label}>
              <div className="flex justify-between text-xs text-slate-600 dark:text-slate-300">
                <span className="truncate pr-2">{r.periodLabel}</span>
                <span className="shrink-0 tabular-nums">{format(r)}</span>
              </div>
              <div className="mt-0.5 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div className={`h-2 rounded-full ${color}`} style={{ width: `${w}%` }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

type CompareKind = 'previous_block' | 'prev_month' | 'custom_b'

function ComparisonBlock({
  labelA,
  labelB,
  a,
  b,
  loadingB,
  hintB,
}: {
  labelA: string
  labelB: string
  a: EconomicSummary['totals']
  b: EconomicSummary['totals'] | null
  loadingB: boolean
  hintB?: string
}) {
  const rows: Array<{ key: string; fmt: (t: EconomicSummary['totals']) => string; numA: number; numB: (t: EconomicSummary['totals']) => number }> = [
    { key: 'Ingresos caja', fmt: (t) => moneyEs(t.incomeTotal), numA: Number.parseFloat(a.incomeTotal), numB: (t) => Number.parseFloat(t.incomeTotal) },
    { key: 'Egresos caja', fmt: (t) => moneyEs(t.expenseTotal), numA: Number.parseFloat(a.expenseTotal), numB: (t) => Number.parseFloat(t.expenseTotal) },
    { key: 'Resultado caja', fmt: (t) => moneyEs(t.netCash), numA: Number.parseFloat(a.netCash), numB: (t) => Number.parseFloat(t.netCash) },
    { key: 'Cobros en OT', fmt: (t) => moneyEs(t.otPaymentsTotal), numA: Number.parseFloat(a.otPaymentsTotal), numB: (t) => Number.parseFloat(t.otPaymentsTotal) },
    { key: 'OT abiertas', fmt: (t) => String(t.workOrdersOpened), numA: a.workOrdersOpened, numB: (t) => t.workOrdersOpened },
    { key: 'OT entregadas', fmt: (t) => String(t.workOrdersDelivered), numA: a.workOrdersDelivered, numB: (t) => t.workOrdersDelivered },
    { key: 'Vehículos distintos', fmt: (t) => String(t.distinctVehiclesTouched), numA: a.distinctVehiclesTouched, numB: (t) => t.distinctVehiclesTouched },
  ]

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-600 dark:bg-slate-900">
      <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Comparación de períodos</h2>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        Columna izquierda: período seleccionado. Derecha: período de referencia. La variación es{' '}
        <span className="font-medium">(seleccionado − referencia) / |referencia|</span>; en montos sirve para ver si
        mejoró respecto al otro tramo.
      </p>
      {hintB && <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">{hintB}</p>}
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[28rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs text-slate-500 dark:border-slate-600 dark:text-slate-400">
              <th className="py-2 pr-3 font-medium">Métrica</th>
              <th className="py-2 pr-3 font-medium">{labelA}</th>
              <th className="py-2 pr-3 font-medium">{labelB}</th>
              <th className="py-2 font-medium">Variación</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const nb = b ? row.numB(b) : null
              const delta = b && nb !== null ? pctDeltaVsRef(row.numA, nb) : loadingB ? '…' : '—'
              return (
                <tr key={row.key} className="border-b border-slate-100 dark:border-slate-800">
                  <td className="py-2 pr-3 text-slate-600 dark:text-slate-300">{row.key}</td>
                  <td className="py-2 pr-3 tabular-nums text-slate-900 dark:text-slate-50">{row.fmt(a)}</td>
                  <td className="py-2 pr-3 tabular-nums text-slate-700 dark:text-slate-200">
                    {loadingB ? '…' : b ? row.fmt(b) : '—'}
                  </td>
                  <td className="py-2 tabular-nums text-slate-600 dark:text-slate-300">{delta}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function ReportsPage() {
  const [preset, setPreset] = useState<PresetId>('7d')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [granularity, setGranularity] = useState<Granularity>('day')
  const [data, setData] = useState<EconomicSummary | null>(null)
  const [compareData, setCompareData] = useState<EconomicSummary | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingCompare, setLoadingCompare] = useState(false)

  const [compareOn, setCompareOn] = useState(false)
  const [compareKind, setCompareKind] = useState<CompareKind>('previous_block')
  const [compareBFrom, setCompareBFrom] = useState('')
  const [compareBTo, setCompareBTo] = useState('')

  const range = useMemo(() => {
    if (preset === 'custom') {
      let from = customFrom.trim()
      let to = customTo.trim()
      if (!from || !to) {
        const fb = PRESETS[0].range()
        return fb
      }
      if (from > to) [from, to] = [to, from]
      return { from, to }
    }
    const p = PRESETS.find((x) => x.id === preset) ?? PRESETS[0]
    return p.range()
  }, [preset, customFrom, customTo])

  const compareRange = useMemo(() => {
    if (!compareOn) return null
    if (compareKind === 'previous_block') return previousSameLengthRange(range.from, range.to)
    if (compareKind === 'prev_month') return previousFullMonthUtc(range.from)
    let cf = compareBFrom.trim()
    let ct = compareBTo.trim()
    if (!cf || !ct) return null
    if (cf > ct) [cf, ct] = [ct, cf]
    return { from: cf, to: ct }
  }, [compareOn, compareKind, range.from, range.to, compareBFrom, compareBTo])

  const compareHint = useMemo(() => {
    if (!compareOn) return undefined
    if (compareKind === 'custom_b' && !compareRange) return 'Definí fecha desde y hasta del período B (calendario).'
    return undefined
  }, [compareOn, compareKind, compareRange])

  const load = useCallback(async () => {
    setErr(null)
    setLoading(true)
    const fetchCompare = Boolean(compareOn && compareRange)
    if (fetchCompare) setLoadingCompare(true)
    try {
      const qs = new URLSearchParams({
        from: range.from,
        to: range.to,
        granularity,
      })
      const res = await api<EconomicSummary>(`/reports/economic-summary?${qs}`)
      setData(res)

      if (fetchCompare && compareRange) {
        const qs2 = new URLSearchParams({
          from: compareRange.from,
          to: compareRange.to,
          granularity,
        })
        const res2 = await api<EconomicSummary>(`/reports/economic-summary?${qs2}`)
        setCompareData(res2)
      } else {
        setCompareData(null)
      }
    } catch (e) {
      setData(null)
      setCompareData(null)
      setErr(e instanceof Error ? e.message : 'Error al cargar informes')
    } finally {
      setLoading(false)
      setLoadingCompare(false)
    }
  }, [range.from, range.to, granularity, compareOn, compareRange?.from, compareRange?.to])

  useEffect(() => {
    void load()
  }, [load])

  function onPresetChange(next: PresetId) {
    if (next === 'custom' && preset !== 'custom') {
      const r = PRESETS.find((p) => p.id === preset)?.range() ?? PRESETS[0].range()
      setCustomFrom(r.from)
      setCustomTo(r.to)
    }
    setPreset(next)
  }

  const compareKindLabel: Record<CompareKind, string> = {
    previous_block: 'Bloque anterior (misma cantidad de días)',
    prev_month: 'Mes calendario UTC previo (al mes de inicio del rango A)',
    custom_b: 'Otro rango (calendario B)',
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">Informes</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Vista agregada de caja, cobros en órdenes y actividad de OT. Los períodos usan fechas UTC (coinciden con el
          API). Podés fijar un rango con el calendario o comparar contra otro tramo.
        </p>
      </div>

      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-600 dark:bg-slate-900">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <label className="block text-sm">
            <span className="va-label">Período</span>
            <select
              value={preset}
              onChange={(e) => onPresetChange(e.target.value as PresetId)}
              className="va-field mt-1 min-w-[12rem]"
            >
              {PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
              <option value="custom">Rango personalizado (calendario)</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="va-label">Agrupación</span>
            <select
              value={granularity}
              onChange={(e) => setGranularity(e.target.value as Granularity)}
              className="va-field mt-1 min-w-[10rem]"
            >
              {GRANULARITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            {loading ? 'Cargando…' : 'Actualizar'}
          </button>
        </div>

        {preset === 'custom' && (
          <div className="flex flex-col gap-3 border-t border-slate-100 pt-4 dark:border-slate-800 sm:flex-row sm:flex-wrap sm:items-end">
            <label className="block text-sm">
              <span className="va-label">Desde (UTC)</span>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="va-field mt-1 min-w-[11rem]"
              />
            </label>
            <label className="block text-sm">
              <span className="va-label">Hasta (UTC)</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="va-field mt-1 min-w-[11rem]"
              />
            </label>
            <p className="max-w-md text-xs text-slate-500 dark:text-slate-400">
              El navegador muestra el selector de calendario. Las fechas se envían como día calendario UTC al API.
            </p>
          </div>
        )}

        <div className="border-t border-slate-100 pt-4 dark:border-slate-800">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-800 dark:text-slate-200">
            <input
              type="checkbox"
              checked={compareOn}
              onChange={(e) => setCompareOn(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 dark:border-slate-600"
            />
            <span className="font-medium">Comparar con otro período</span>
          </label>
          {compareOn && (
            <div className="mt-3 space-y-3">
              <label className="block max-w-xl text-sm">
                <span className="va-label">Modo de comparación</span>
                <select
                  value={compareKind}
                  onChange={(e) => setCompareKind(e.target.value as CompareKind)}
                  className="va-field mt-1 w-full"
                >
                  {(Object.keys(compareKindLabel) as CompareKind[]).map((k) => (
                    <option key={k} value={k}>
                      {compareKindLabel[k]}
                    </option>
                  ))}
                </select>
              </label>
              {compareKind === 'custom_b' && (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <label className="block text-sm">
                    <span className="va-label">Período B — desde</span>
                    <input
                      type="date"
                      value={compareBFrom}
                      onChange={(e) => setCompareBFrom(e.target.value)}
                      className="va-field mt-1 min-w-[11rem]"
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="va-label">Período B — hasta</span>
                    <input
                      type="date"
                      value={compareBTo}
                      onChange={(e) => setCompareBTo(e.target.value)}
                      className="va-field mt-1 min-w-[11rem]"
                    />
                  </label>
                </div>
              )}
              {compareRange && (
                <p className="font-mono text-xs text-slate-500 dark:text-slate-400">
                  Referencia (B): {compareRange.from} → {compareRange.to} · {granularity}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {err && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-200">
          {err}
        </p>
      )}

      {loading && !data && <p className="text-slate-500 dark:text-slate-400">Cargando…</p>}

      {data && (
        <>
          <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">{data.disclaimer}</p>
          <p className="font-mono text-xs text-slate-400 dark:text-slate-500">
            Seleccionado (A): {data.from} → {data.to} · {data.granularity}
          </p>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['Ingresos caja', moneyEs(data.totals.incomeTotal), 'text-emerald-700 dark:text-emerald-300'],
              ['Egresos caja', moneyEs(data.totals.expenseTotal), 'text-red-700 dark:text-red-300'],
              ['Resultado caja (neto)', moneyEs(data.totals.netCash), 'text-brand-800 dark:text-brand-200'],
              ['Cobros en OT', moneyEs(data.totals.otPaymentsTotal), 'text-slate-800 dark:text-slate-100'],
            ].map(([k, v, cls]) => (
              <div key={String(k)} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-600 dark:bg-slate-900">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{k}</p>
                <p className={`mt-1 text-lg font-semibold tabular-nums ${cls}`}>{v}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-600 dark:bg-slate-900">
              <p className="text-xs text-slate-500 dark:text-slate-400">OT abiertas en período</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-50">{data.totals.workOrdersOpened}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-600 dark:bg-slate-900">
              <p className="text-xs text-slate-500 dark:text-slate-400">OT entregadas (fecha entrega)</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-50">{data.totals.workOrdersDelivered}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-600 dark:bg-slate-900">
              <p className="text-xs text-slate-500 dark:text-slate-400">Vehículos distintos (aprox. atendidos)</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-50">{data.totals.distinctVehiclesTouched}</p>
            </div>
          </div>

          {compareOn && (
            <ComparisonBlock
              labelA={`A: ${data.from} → ${data.to}`}
              labelB={compareRange ? `B: ${compareRange.from} → ${compareRange.to}` : 'B: (definí fechas)'}
              a={data.totals}
              b={compareData?.totals ?? null}
              loadingB={loadingCompare}
              hintB={compareHint}
            />
          )}

          {data.series.length > 0 && (
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-600 dark:bg-slate-900">
                <BarChart
                  rows={data.series}
                  getNumeric={(r) => Number.parseFloat(r.incomeTotal)}
                  format={(r) => moneyEs(r.incomeTotal)}
                  label="Ingresos por período"
                  color="bg-emerald-500"
                />
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-600 dark:bg-slate-900">
                <BarChart
                  rows={data.series}
                  getNumeric={(r) => Number.parseFloat(r.netCash)}
                  format={(r) => moneyEs(r.netCash)}
                  label="Resultado caja por período"
                  color="bg-brand-500"
                />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
