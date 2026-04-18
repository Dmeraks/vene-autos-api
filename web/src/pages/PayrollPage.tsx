import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../api/client'
import type {
  PayrollAdjustmentKind,
  PayrollRun,
  PayrollTechnicianConfig,
  PayrollWeekSummary,
} from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { useConfirm, usePrompt } from '../components/confirm/ConfirmProvider'
import { PageHeader } from '../components/layout/PageHeader'
import { usePanelTheme } from '../theme/PanelThemeProvider'

// ---------------------------------------------------------------------------
// Utilidades de semana (lunes→sábado, alineado con backend).
// ---------------------------------------------------------------------------

function ymdUtc(d: Date): string {
  return d.toISOString().slice(0, 10)
}
function parseUtcYmd(ymd: string): Date {
  return new Date(
    Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)) - 1, Number(ymd.slice(8, 10))),
  )
}
function mondayOfWeekUtc(d: Date): Date {
  const x = new Date(d.getTime())
  const dow = x.getUTCDay()
  if (dow === 0) {
    // Domingo: retroceder 6 días al lunes que ya pasó (semana que acaba de cerrar).
    x.setUTCDate(x.getUTCDate() - 6)
  } else {
    x.setUTCDate(x.getUTCDate() - (dow - 1))
  }
  x.setUTCHours(0, 0, 0, 0)
  return x
}
function addDaysUtc(d: Date, days: number): Date {
  const x = new Date(d.getTime())
  x.setUTCDate(x.getUTCDate() + days)
  return x
}

function formatHuman(ymd: string): string {
  const d = parseUtcYmd(ymd)
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

function formatShort(ymd: string): string {
  const d = parseUtcYmd(ymd)
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', timeZone: 'UTC' })
}

function formatCop(raw: string | null | undefined): string {
  if (raw == null || raw === '') return '—'
  const n = Number(raw)
  if (!Number.isFinite(n)) return '—'
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(n)
}

function isoToCo(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })
}

const KIND_LABEL: Record<PayrollAdjustmentKind, string> = {
  BONUS: 'Bono',
  ADVANCE: 'Adelanto',
  DEDUCTION: 'Descuento',
  OTHER: 'Otro',
}

const ADJ_KIND_ORDER: readonly PayrollAdjustmentKind[] = ['BONUS', 'OTHER', 'ADVANCE', 'DEDUCTION']

function adjustmentKindAddsToPay(kind: PayrollAdjustmentKind): boolean {
  return kind === 'BONUS' || kind === 'OTHER'
}

const STATUS_LABEL: Record<PayrollRun['status'], string> = {
  DRAFT: 'Borrador',
  PAID: 'Pagada',
  VOIDED: 'Anulada',
}

// ---------------------------------------------------------------------------
// Página principal
// ---------------------------------------------------------------------------

export default function PayrollPage() {
  const { can } = useAuth()
  const panelTheme = usePanelTheme()
  const isSaas = panelTheme === 'saas_light'
  const canCalc = can('payroll:calculate')
  const canPay = can('payroll:pay')
  const canConfigure = can('payroll:configure')
  /** Alineado con API: montos de MO solo si puede calcular, pagar o configurar nómina. */
  const canViewLaborAmounts = canCalc || canPay || canConfigure

  const initialWeek = useMemo(() => ymdUtc(mondayOfWeekUtc(new Date())), [])
  const [weekStart, setWeekStart] = useState<string>(initialWeek)
  const [summary, setSummary] = useState<PayrollWeekSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actionBusy, setActionBusy] = useState<string | null>(null)
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [configOpen, setConfigOpen] = useState(false)
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const showToast = useCallback((kind: 'ok' | 'err', text: string) => {
    setToast({ kind, text })
    window.setTimeout(() => setToast(null), 4500)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api<PayrollWeekSummary>(`/payroll/weeks?weekStart=${weekStart}`)
      setSummary(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar la nómina')
    } finally {
      setLoading(false)
    }
  }, [weekStart])

  useEffect(() => {
    void load()
  }, [load])

  const shiftWeek = (days: number) => {
    const d = parseUtcYmd(weekStart)
    const shifted = addDaysUtc(d, days)
    setWeekStart(ymdUtc(mondayOfWeekUtc(shifted)))
  }

  const goThisWeek = () => setWeekStart(ymdUtc(mondayOfWeekUtc(new Date())))

  const recalculate = async () => {
    if (!canCalc) return
    setActionBusy('recalc')
    try {
      const data = await api<PayrollWeekSummary>('/payroll/weeks/recalculate', {
        method: 'POST',
        body: JSON.stringify({ weekStart }),
      })
      setSummary(data)
      showToast('ok', 'Semana recalculada')
    } catch (e) {
      showToast('err', e instanceof Error ? e.message : 'Error al recalcular')
    } finally {
      setActionBusy(null)
    }
  }

  const onPaid = () => {
    setSelectedRunId(null)
    void load()
  }

  const selectedRun = useMemo(() => {
    if (!selectedRunId || !summary) return null
    return summary.rows.find((r) => r.run?.id === selectedRunId)?.run ?? null
  }, [selectedRunId, summary])

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <PageHeader
        title="Pago de nómina"
        description="Comisión semanal de los técnicos sobre la mano de obra de las OT entregadas (lunes → sábado)."
        actions={
          canConfigure ? (
            <button
              type="button"
              onClick={() => setConfigOpen(true)}
              className="va-btn-secondary"
            >
              Configuración
            </button>
          ) : null
        }
      />

      {toast ? (
        <div
          role="status"
          className={`mb-4 rounded-lg border px-3 py-2 text-sm ${
            toast.kind === 'ok'
              ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200'
              : 'border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-700 dark:bg-rose-900/30 dark:text-rose-200'
          }`}
        >
          {toast.text}
        </div>
      ) : null}

      <div className="mb-4 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => shiftWeek(-7)}
            className="va-btn-secondary"
            aria-label="Semana anterior"
          >
            ◀
          </button>
          <div className="min-w-[220px] text-sm">
            <div className="font-semibold text-slate-800 dark:text-zinc-100">
              {summary ? (
                <>
                  {formatHuman(summary.weekStart)} — {formatHuman(summary.weekEnd)}
                </>
              ) : (
                'Cargando…'
              )}
            </div>
            <div className="text-xs text-slate-500 dark:text-zinc-400">Día de pago: sábado</div>
          </div>
          <button
            type="button"
            onClick={() => shiftWeek(7)}
            className="va-btn-secondary"
            aria-label="Semana siguiente"
          >
            ▶
          </button>
          <button type="button" onClick={goThisWeek} className="va-btn-secondary">
            Esta semana
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canCalc ? (
            <button
              type="button"
              onClick={recalculate}
              disabled={actionBusy === 'recalc' || loading}
              className="va-btn-primary"
            >
              {actionBusy === 'recalc' ? 'Recalculando…' : 'Recalcular semana'}
            </button>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="mb-4 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-700 dark:bg-rose-900/30 dark:text-rose-200">
          {error}
        </div>
      ) : null}

      {summary ? (
        <TotalsCards summary={summary} canViewLaborAmounts={canViewLaborAmounts} />
      ) : null}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-zinc-800 dark:text-zinc-400">
            <tr>
              <th className="px-4 py-2">Técnico</th>
              <th className="px-4 py-2 text-right">%</th>
              <th className="px-4 py-2 text-right">OTs</th>
              {canViewLaborAmounts ? (
                <th className="px-4 py-2 text-right">Base MO</th>
              ) : null}
              <th className="px-4 py-2 text-right">Comisión</th>
              <th className="px-4 py-2 text-right">Ajustes</th>
              <th className="px-4 py-2 text-right">Total a pagar</th>
              <th className="px-4 py-2">Estado</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {loading && !summary ? (
              <tr>
                <td
                  colSpan={canViewLaborAmounts ? 9 : 8}
                  className="px-4 py-8 text-center text-slate-500 dark:text-zinc-400"
                >
                  Cargando…
                </td>
              </tr>
            ) : summary && summary.rows.length === 0 ? (
              <tr>
                <td
                  colSpan={canViewLaborAmounts ? 9 : 8}
                  className="px-4 py-8 text-center text-slate-500 dark:text-zinc-400"
                >
                  No hay mecánicos con rol <code>mecanico</code>. Asigná el rol a los usuarios que corresponda.
                </td>
              </tr>
            ) : (
              summary?.rows.map((row) => {
                const r = row.run
                return (
                  <tr
                    key={row.technician.userId}
                    className="border-t border-slate-100 dark:border-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-800/60"
                  >
                    <td className="px-4 py-2">
                      <div className="font-medium text-slate-800 dark:text-zinc-100">
                        {row.technician.fullName}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-zinc-400">
                        {row.technician.email}
                      </div>
                      {!row.technician.isActiveInPayroll ? (
                        <span className="mt-0.5 inline-block rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium uppercase text-slate-700 dark:bg-zinc-700 dark:text-zinc-300">
                          Inactivo en nómina
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{row.technician.commissionPct}%</td>
                    <td className="px-4 py-2 text-right tabular-nums">{r?.otsCount ?? 0}</td>
                    {canViewLaborAmounts ? (
                      <td className="px-4 py-2 text-right tabular-nums">{r ? formatCop(r.baseAmount) : '—'}</td>
                    ) : null}
                    <td className="px-4 py-2 text-right tabular-nums">{r ? formatCop(r.commissionAmount) : '—'}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {r ? formatCop(r.adjustmentsTotal) : '—'}
                    </td>
                    <td className="px-4 py-2 text-right font-semibold tabular-nums text-slate-900 dark:text-zinc-50">
                      {r ? formatCop(r.totalToPay) : '—'}
                    </td>
                    <td className="px-4 py-2">
                      {r ? (
                        <StatusBadge status={r.status} />
                      ) : (
                        <span className="text-xs text-slate-500 dark:text-zinc-400">
                          Sin OT entregadas
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {r ? (
                        <button
                          type="button"
                          onClick={() => setSelectedRunId(r.id)}
                          className="text-brand-700 hover:underline dark:text-brand-400"
                        >
                          Ver detalle
                        </button>
                      ) : null}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {summary && summary.unassigned.ots.length > 0 ? (
        <UnassignedCard summary={summary} />
      ) : null}

      {selectedRun ? (
        <PayrollRunDetailModal
          isSaas={isSaas}
          run={selectedRun}
          canViewLaborAmounts={canViewLaborAmounts}
          canCalc={canCalc}
          canPay={canPay}
          canVoid={canConfigure}
          onClose={() => setSelectedRunId(null)}
          onChanged={onPaid}
          showToast={showToast}
        />
      ) : null}

      {configOpen && canConfigure ? (
        <TechniciansConfigModal
          isSaas={isSaas}
          onClose={() => setConfigOpen(false)}
          onSaved={() => void load()}
        />
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Componentes auxiliares
// ---------------------------------------------------------------------------

function TotalsCards({
  summary,
  canViewLaborAmounts,
}: {
  summary: PayrollWeekSummary
  canViewLaborAmounts: boolean
}) {
  return (
    <div
      className={`mb-4 grid grid-cols-1 gap-3 ${
        canViewLaborAmounts && summary.unassigned.totalLaborSubtotal != null
          ? 'sm:grid-cols-3'
          : 'sm:grid-cols-2'
      }`}
    >
      <MetricCard
        label="Pendiente de pago (borrador)"
        value={formatCop(summary.totals.commissionDraft)}
        tone="amber"
      />
      <MetricCard
        label="Pagado esta semana"
        value={formatCop(summary.totals.commissionPaid)}
        tone="emerald"
      />
      {canViewLaborAmounts && summary.unassigned.totalLaborSubtotal != null ? (
        <MetricCard
          label="MO sin técnico asignado"
          value={formatCop(summary.unassigned.totalLaborSubtotal)}
          tone="slate"
        />
      ) : null}
    </div>
  )
}

function MetricCard({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: 'amber' | 'emerald' | 'slate'
}) {
  const cls =
    tone === 'amber'
      ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200'
      : tone === 'emerald'
      ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200'
      : 'border-slate-300 bg-slate-50 text-slate-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200'
  return (
    <div className={`rounded-xl border p-3 shadow-sm ${cls}`}>
      <div className="text-xs uppercase tracking-wide opacity-80">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
    </div>
  )
}

function StatusBadge({ status }: { status: PayrollRun['status'] }) {
  const cls =
    status === 'PAID'
      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
      : status === 'VOIDED'
      ? 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200'
      : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${cls}`}>
      {STATUS_LABEL[status]}
    </span>
  )
}

function UnassignedCard({ summary }: { summary: PayrollWeekSummary }) {
  return (
    <div className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 shadow-sm dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200">
      <div className="font-semibold">
        OT entregadas sin técnico asignado: {summary.unassigned.ots.length}
      </div>
      <p className="mt-1 text-xs">
        Estas OT tienen mano de obra pero ningún técnico para pagarle. Asigná técnico en la OT y
        volvé a recalcular la semana.
      </p>
      <ul className="mt-2 divide-y divide-amber-200 dark:divide-amber-800">
        {summary.unassigned.ots.map((ot) => (
          <li key={ot.workOrderId} className="flex items-center justify-between py-1.5">
            <div>
              <span className="font-mono text-xs">{ot.publicCode}</span>
              <span className="ml-2">{ot.vehiclePlate ?? '—'}</span>
              <span className="ml-2 text-xs opacity-75">
                {ot.customerName ?? ''} · {isoToCo(ot.deliveredAt)}
              </span>
            </div>
            <div className="tabular-nums">{formatCop(ot.laborSubtotal)}</div>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Modal de detalle de una corrida (mismo patrón flotante que configuración de nómina).
// ---------------------------------------------------------------------------

function PayrollRunDetailModal({
  isSaas,
  run,
  canViewLaborAmounts,
  canCalc,
  canPay,
  canVoid,
  onClose,
  onChanged,
  showToast,
}: {
  isSaas: boolean
  run: PayrollRun
  /** Alineado con API: montos de MO y totales que permiten inferir la base. */
  canViewLaborAmounts: boolean
  canCalc: boolean
  canPay: boolean
  canVoid: boolean
  onClose: () => void
  onChanged: () => void
  showToast: (kind: 'ok' | 'err', text: string) => void
}) {
  const confirmDlg = useConfirm()
  const promptDlg = usePrompt()
  const [detail, setDetail] = useState<PayrollRun>(run)
  const [busy, setBusy] = useState<string | null>(null)
  const [adjKind, setAdjKind] = useState<PayrollAdjustmentKind>('BONUS')
  const [adjAmount, setAdjAmount] = useState<string>('')
  const [adjNote, setAdjNote] = useState<string>('')

  const refresh = useCallback(async () => {
    try {
      const d = await api<PayrollRun>(`/payroll/runs/${run.id}`)
      setDetail(d)
    } catch (e) {
      showToast('err', e instanceof Error ? e.message : 'No se pudo cargar el detalle')
    }
  }, [run.id, showToast])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const addAdj = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!adjAmount) return
    setBusy('adj')
    try {
      await api(`/payroll/runs/${run.id}/adjustments`, {
        method: 'POST',
        body: JSON.stringify({ kind: adjKind, amount: adjAmount, note: adjNote || undefined }),
      })
      setAdjAmount('')
      setAdjNote('')
      await refresh()
      onChanged()
      showToast('ok', 'Ajuste agregado')
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'No se pudo agregar el ajuste')
    } finally {
      setBusy(null)
    }
  }

  const removeAdj = async (adjustmentId: string) => {
    const ok = await confirmDlg({
      title: 'Quitar ajuste',
      message: '¿Quitar este ajuste de la corrida?',
      variant: 'danger',
      confirmLabel: 'Quitar',
      cancelLabel: 'Cancelar',
    })
    if (!ok) return
    setBusy('adj:' + adjustmentId)
    try {
      await api(`/payroll/runs/${run.id}/adjustments/${adjustmentId}`, { method: 'DELETE' })
      await refresh()
      onChanged()
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'No se pudo quitar el ajuste')
    } finally {
      setBusy(null)
    }
  }

  const pay = async () => {
    const noteInput = await promptDlg({
      title: 'Registrar pago en caja',
      message: (
        <>
          <p>
            Confirmá el pago a <strong>{detail.technician.fullName}</strong> por{' '}
            <strong>{formatCop(detail.totalToPay)}</strong>.
          </p>
          <p className="mt-2">Podés agregar una nota opcional (medio de pago, referencia, etc.).</p>
        </>
      ),
      placeholder: 'Ej. efectivo, Nequi, referencia…',
      confirmLabel: 'Registrar pago',
      maxLength: 500,
    })
    if (noteInput === null) return
    setBusy('pay')
    try {
      await api(`/payroll/runs/${run.id}/pay`, {
        method: 'POST',
        body: JSON.stringify({ note: noteInput || undefined }),
      })
      showToast('ok', 'Pago registrado en caja')
      onChanged()
      onClose()
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'No se pudo registrar el pago')
    } finally {
      setBusy(null)
    }
  }

  const voidRun = async () => {
    const reason = await promptDlg({
      title: 'Anular corrida',
      message:
        'Ingresá el motivo de la anulación (mínimo 5 caracteres). Se reversará el pago registrado en caja.',
      placeholder: 'Motivo…',
      minLength: 5,
      maxLength: 500,
      multiline: true,
      variant: 'danger',
      confirmLabel: 'Anular corrida',
    })
    if (reason === null) return
    setBusy('void')
    try {
      await api(`/payroll/runs/${run.id}/void`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      })
      showToast('ok', 'Corrida anulada (pago reversado)')
      onChanged()
      onClose()
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'No se pudo anular')
    } finally {
      setBusy(null)
    }
  }

  const isDraft = detail.status === 'DRAFT'
  const isPaid = detail.status === 'PAID'

  const titleClass = isSaas
    ? 'va-section-title text-base'
    : 'text-lg font-semibold text-slate-900 dark:text-slate-50'

  return (
    <div className="va-modal-overlay z-[54]" role="presentation">
      <div
        className="flex max-h-[min(92dvh,48rem)] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:max-h-[min(88dvh,48rem)] sm:rounded-2xl dark:border-slate-600 dark:bg-slate-900 dark:shadow-black/50"
        role="dialog"
        aria-modal="true"
        aria-labelledby="payroll-run-detail-title"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-4 py-4 dark:border-slate-800 sm:px-6">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Corrida semanal
            </p>
            <h2 id="payroll-run-detail-title" className={`mt-0.5 ${titleClass}`}>
              {detail.technician.fullName}
            </h2>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
              {formatShort(detail.weekStart)} → {formatShort(detail.weekEnd)}
              {detail.commissionPctApplied != null ? ` · ${detail.commissionPctApplied}%` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="shrink-0 rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
          <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-zinc-700 dark:bg-zinc-800">
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-zinc-400">
                Total a pagar
              </div>
              <div className="text-2xl font-bold tabular-nums text-slate-900 dark:text-zinc-50">
                {formatCop(detail.totalToPay)}
              </div>
              <div className="mt-1 text-xs text-slate-600 dark:text-zinc-400">
                {canViewLaborAmounts ? (
                  <>
                    Comisión {formatCop(detail.commissionAmount)} + ajustes {formatCop(detail.adjustmentsTotal)}
                  </>
                ) : (
                  <>
                    Alícuota de comisión: <span className="font-semibold text-slate-800 dark:text-zinc-100">{detail.commissionPctApplied}%</span> (la define administración). Ajustes:{' '}
                    {formatCop(detail.adjustmentsTotal)}.
                  </>
                )}
              </div>
            </div>
            <StatusBadge status={detail.status} />
          </div>

          {isDraft && canPay ? (
            <button
              type="button"
              onClick={pay}
              disabled={busy === 'pay' || Number(detail.totalToPay) <= 0}
              className="va-btn-primary w-full"
            >
              {busy === 'pay' ? 'Pagando…' : `Registrar pago en caja · ${formatCop(detail.totalToPay)}`}
            </button>
          ) : null}

          {isPaid && detail.paidAt ? (
            <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-200">
              Pagado el {isoToCo(detail.paidAt)}
              {detail.cashMovementId ? (
                <div className="mt-1 text-xs opacity-80">
                  Movimiento de caja: <code>{detail.cashMovementId}</code>
                </div>
              ) : null}
            </div>
          ) : null}

          {isPaid && canVoid ? (
            <button type="button" onClick={voidRun} disabled={busy === 'void'} className="va-btn-secondary w-full">
              {busy === 'void' ? 'Anulando…' : 'Anular corrida (reversa pago)'}
            </button>
          ) : null}

          {/* OTs */}
          <section>
            <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-zinc-200">
                OTs de la semana ({detail.entries.length})
              </h3>
              {!canViewLaborAmounts ? (
                <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-zinc-400">
                  Importe: comisión por OT
                </span>
              ) : null}
            </div>
            {detail.entries.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                Ninguna OT entregada con mano de obra en este rango.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-zinc-800 dark:border-zinc-700">
                {detail.entries.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <div>
                      <div className="font-mono text-xs text-slate-600 dark:text-zinc-300">{e.publicCode}</div>
                      <div className="text-slate-800 dark:text-zinc-100">
                        {e.vehiclePlate ?? '—'} · {e.customerName ?? 'Sin nombre'}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-zinc-400">
                        Entregada {isoToCo(e.deliveredAt)}
                        {canViewLaborAmounts && e.laborSubtotal != null ? ` · MO ${formatCop(e.laborSubtotal)}` : null}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      {!canViewLaborAmounts ? (
                        <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-zinc-500">
                          Comisión
                        </div>
                      ) : null}
                      <div className="font-semibold tabular-nums text-slate-900 dark:text-zinc-50">
                        {formatCop(e.commission)}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Ajustes */}
          <section>
            <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-zinc-200">
              Ajustes ({detail.adjustments.length})
            </h3>
            {detail.adjustments.length > 0 ? (
              <ul className="mb-3 divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-zinc-800 dark:border-zinc-700">
                {detail.adjustments.map((a) => {
                  const n = Number(a.amount)
                  const isNeg = n < 0
                  return (
                    <li key={a.id} className="flex items-start justify-between px-3 py-2 text-sm">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium uppercase text-slate-600 dark:text-zinc-300">
                            {KIND_LABEL[a.kind]}
                          </span>
                          <span
                            className={`font-semibold tabular-nums ${isNeg ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-300'}`}
                          >
                            {isNeg ? '-' : '+'}
                            {formatCop(String(Math.abs(n)))}
                          </span>
                        </div>
                        {a.note ? (
                          <div className="text-xs text-slate-500 dark:text-zinc-400">{a.note}</div>
                        ) : null}
                        <div className="text-[10px] text-slate-400 dark:text-zinc-500">
                          {isoToCo(a.createdAt)} · {a.createdBy?.fullName ?? '—'}
                        </div>
                      </div>
                      {isDraft && canCalc ? (
                        <button
                          type="button"
                          onClick={() => removeAdj(a.id)}
                          disabled={busy === 'adj:' + a.id}
                          className="text-xs text-rose-600 hover:underline dark:text-rose-400"
                        >
                          Quitar
                        </button>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            ) : null}

            {isDraft && canCalc ? (
              <form
                onSubmit={addAdj}
                className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/95 p-4 shadow-sm ring-1 ring-slate-200/50 dark:border-zinc-600 dark:bg-zinc-900/45 dark:shadow-inner dark:ring-zinc-700/60"
              >
                <div>
                  <span className="va-label mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-zinc-300">
                    Tipo de ajuste
                  </span>
                  <div
                    className="va-tabstrip va-tabstrip--wrap va-tabstrip--compact w-full"
                    role="tablist"
                    aria-label="Tipo de ajuste"
                  >
                    {ADJ_KIND_ORDER.map((k) => {
                      const on = adjKind === k
                      const adds = adjustmentKindAddsToPay(k)
                      return (
                        <button
                          key={k}
                          type="button"
                          role="tab"
                          aria-selected={on}
                          onClick={() => setAdjKind(k)}
                          className={`va-tab max-sm:min-h-[48px] ${on ? 'va-tab-active' : 'va-tab-inactive'}`}
                        >
                          <span className="block text-left text-sm font-medium leading-tight">{KIND_LABEL[k]}</span>
                          <span
                            className={`mt-0.5 block text-left text-[10px] font-normal leading-tight ${
                              adds
                                ? 'text-emerald-700 dark:text-emerald-300/90'
                                : 'text-rose-700 dark:text-rose-300/90'
                            }`}
                          >
                            {adds ? 'Suma al pago' : 'Resta del pago'}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="min-w-0">
                    <span className="va-label mb-1 block">Monto (COP, positivo)</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="\d*"
                      value={adjAmount}
                      onChange={(e) => setAdjAmount(e.target.value.replace(/\D/g, ''))}
                      placeholder="Ej. 50000"
                      className="va-field w-full tabular-nums"
                      required
                    />
                  </label>
                  <label className="min-w-0">
                    <span className="va-label mb-1 block">Nota (opcional)</span>
                    <input
                      type="text"
                      maxLength={500}
                      value={adjNote}
                      onChange={(e) => setAdjNote(e.target.value)}
                      placeholder="Motivo o referencia"
                      className="va-field w-full"
                    />
                  </label>
                </div>
                <button type="submit" disabled={busy === 'adj' || !adjAmount} className="va-btn-primary w-full">
                  {busy === 'adj' ? 'Agregando…' : 'Agregar ajuste'}
                </button>
              </form>
            ) : null}
          </section>
        </div>

        <div className="flex shrink-0 justify-end border-t border-slate-100 px-4 py-3 dark:border-slate-800 sm:px-6">
          <button type="button" onClick={onClose} className="va-btn-secondary">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Modal de configuración por mecánico (% de comisión) — mismo patrón que `va-modal-*` en el resto del panel.
// ---------------------------------------------------------------------------

function TechniciansConfigModal({
  isSaas,
  onClose,
  onSaved,
}: {
  isSaas: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const [techs, setTechs] = useState<PayrollTechnicianConfig[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const data = await api<PayrollTechnicianConfig[]>('/payroll/technicians/config')
      setTechs(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const save = async (userId: string, pct: number, isActive: boolean) => {
    setBusy(userId)
    try {
      await api(`/payroll/technicians/${userId}/config`, {
        method: 'PUT',
        body: JSON.stringify({ laborCommissionPct: pct, isActive }),
      })
      await load()
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar')
    } finally {
      setBusy(null)
    }
  }

  const titleClass = isSaas
    ? 'va-section-title text-base'
    : 'text-lg font-semibold text-slate-900 dark:text-slate-50'

  return (
    <div className="va-modal-overlay z-[55]" role="presentation">
      <div
        className="flex max-h-[min(92dvh,36rem)] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:max-h-[min(85dvh,36rem)] sm:rounded-2xl dark:border-slate-600 dark:bg-slate-900 dark:shadow-black/50"
        role="dialog"
        aria-modal="true"
        aria-labelledby="payroll-config-modal-title"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-4 py-4 dark:border-slate-800 sm:px-6">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Nómina</p>
            <h2 id="payroll-config-modal-title" className={`mt-0.5 ${titleClass}`}>
              Configuración por mecánico
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              Porcentaje de la mano de obra (MO) que recibe cada mecánico. Default 50%. El cambio se aplica sólo a{' '}
              <strong className="font-medium text-slate-800 dark:text-slate-100">nuevas</strong> corridas (las PAID /
              VOIDED conservan su %).
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="shrink-0 rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          {error ? (
            <div className="mb-3 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-700 dark:bg-rose-900/30 dark:text-rose-200">
              {error}
            </div>
          ) : null}
          {techs === null ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Cargando…</p>
          ) : techs.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No hay usuarios con rol <code className="rounded bg-slate-200 px-1.5 py-0.5 text-xs dark:bg-slate-700">mecanico</code>.
            </p>
          ) : (
            <ul className="space-y-3">
              {techs.map((t) => (
                <TechConfigRow
                  key={t.userId}
                  tech={t}
                  busy={busy === t.userId}
                  onSave={(pct, active) => save(t.userId, pct, active)}
                />
              ))}
            </ul>
          )}
        </div>

        <div className="flex shrink-0 justify-end border-t border-slate-100 px-4 py-3 dark:border-slate-800 sm:px-6">
          <button type="button" onClick={onClose} className="va-btn-secondary">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}

function TechConfigRow({
  tech,
  busy,
  onSave,
}: {
  tech: PayrollTechnicianConfig
  busy: boolean
  onSave: (pct: number, isActive: boolean) => void
}) {
  const [pct, setPct] = useState<string>(String(tech.commissionPct))
  const [active, setActive] = useState<boolean>(tech.isActiveInPayroll)

  const pctValid = /^\d{1,3}(\.\d{1,2})?$/.test(pct) && Number(pct) >= 0 && Number(pct) <= 100

  return (
    <li className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-600 dark:bg-slate-800/60">
      <div className="mb-2">
        <div className="font-medium text-slate-800 dark:text-slate-100">{tech.fullName}</div>
        <div className="text-xs text-slate-500 dark:text-slate-400">{tech.email}</div>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs">
          <span className="va-label mb-1 block">% de MO</span>
          <input
            type="text"
            inputMode="decimal"
            value={pct}
            onChange={(e) => setPct(e.target.value)}
            className="va-field w-24 tabular-nums"
          />
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Activo en nómina
        </label>
        <button
          type="button"
          onClick={() => onSave(Number(pct), active)}
          disabled={busy || !pctValid}
          className="va-btn-primary ml-auto"
        >
          {busy ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </li>
  )
}
