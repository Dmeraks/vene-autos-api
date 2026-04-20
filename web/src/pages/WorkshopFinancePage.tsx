import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiError } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { useCashSessionOpen } from '../context/CashSessionOpenContext'
import { useConfirm } from '../components/confirm/ConfirmProvider'
import { PageHeader } from '../components/layout/PageHeader'
import { panelUsesModernShell } from '../config/operationalNotes'
import { portalPath } from '../constants/portalPath'
import { usePanelTheme } from '../theme/PanelThemeProvider'

type ReserveLine = {
  id: string
  name: string
  percent: string
  sortOrder: number
  isActive: boolean
}

type ReserveTotalRow = {
  line: ReserveLine
  accumulatedCop: string
}

type ReserveContrib = {
  id: string
  createdAt: string
  cashSessionId: string
  sessionClosedAt: string | null
  lineName: string
  percentApplied: string
  baseCashCounted: string
  contributionAmount: string
}

type PayableRow = {
  id: string
  creditorName: string
  description: string | null
  initialAmount: string
  balanceAmount: string
  status: 'OPEN' | 'SETTLED'
  createdAt: string
  payments: Array<{
    id: string
    amount: string
    method: 'CASH' | 'TRANSFER' | 'OTHER'
    createdAt: string
    note: string | null
  }>
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

function isoShort(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })
}

function describeApiFailure(e: unknown, label: string): string {
  if (e instanceof ApiError) {
    return `${label}: ${e.message}`
  }
  return `${label}: error al cargar.`
}

export default function WorkshopFinancePage() {
  const { can } = useAuth()
  const confirmDeletePayable = useConfirm()
  const { open: cashSessionOpen, refresh: refreshCashOpen } = useCashSessionOpen()
  const panelTheme = usePanelTheme()
  const isSaas = panelUsesModernShell(panelTheme)
  const canRead = can('workshop_finance:read')
  const canManage = can('workshop_finance:manage')

  const pageShell = isSaas ? 'va-saas-page-section rounded-2xl border border-slate-200/85 bg-[var(--va-surface-elevated)] p-4 shadow-sm sm:p-5 dark:border-slate-500/55 dark:bg-slate-900' : 'rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 dark:border-slate-700 dark:bg-slate-900'

  const [tab, setTab] = useState<'reserves' | 'debts'>('reserves')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [totals, setTotals] = useState<ReserveTotalRow[] | null>(null)
  const [history, setHistory] = useState<ReserveContrib[] | null>(null)

  const [payables, setPayables] = useState<PayableRow[] | null>(null)

  const [newLineName, setNewLineName] = useState('')
  const [newLinePct, setNewLinePct] = useState('5')
  const [newDebtCreditor, setNewDebtCreditor] = useState('')
  const [newDebtAmount, setNewDebtAmount] = useState('')
  const [newDebtDesc, setNewDebtDesc] = useState('')

  const [payOpenId, setPayOpenId] = useState<string | null>(null)
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState<'CASH' | 'TRANSFER' | 'OTHER'>('TRANSFER')
  const [payNote, setPayNote] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  /** Si cerraron la caja con el modal abierto y el medio era efectivo, forzar otro medio válido. */
  useEffect(() => {
    if (payOpenId && cashSessionOpen !== true && payMethod === 'CASH') {
      setPayMethod('TRANSFER')
    }
  }, [cashSessionOpen, payMethod, payOpenId])

  /** Carga cada endpoint aparte: si uno falla, el otro puede mostrarse igual y el mensaje es más claro. */
  const loadReserves = useCallback(async (): Promise<string[]> => {
    const errs: string[] = []
    try {
      setTotals(await api<ReserveTotalRow[]>('/workshop-finance/reserve-totals'))
    } catch (e) {
      errs.push(describeApiFailure(e, 'Totales por línea'))
      setTotals([])
    }
    try {
      setHistory(await api<ReserveContrib[]>('/workshop-finance/reserve-contributions?take=40'))
    } catch (e) {
      errs.push(describeApiFailure(e, 'Historial de cierres'))
      setHistory([])
    }
    return errs
  }, [])

  const loadDebts = useCallback(async (): Promise<string[]> => {
    try {
      setPayables(await api<PayableRow[]>('/workshop-finance/payables'))
      return []
    } catch (e) {
      setPayables([])
      return [describeApiFailure(e, 'Lista de deudas')]
    }
  }, [])

  useEffect(() => {
    if (!canRead) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        if (tab === 'reserves') {
          const errs = await loadReserves()
          if (!cancelled && errs.length) setError(errs.join(' · '))
        } else {
          const errs = await loadDebts()
          if (!cancelled && errs.length) setError(errs.join(' · '))
        }
      } catch (e) {
        if (!cancelled)
          setError(e instanceof ApiError ? e.message : 'No se pudo cargar.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [canRead, tab, loadReserves, loadDebts])

  async function addLine(e: FormEvent) {
    e.preventDefault()
    if (!canManage) return
    setBusy('line')
    setError(null)
    try {
      await api('/workshop-finance/reserve-lines', {
        method: 'POST',
        body: JSON.stringify({
          name: newLineName.trim(),
          percent: Number(newLinePct.replace(',', '.')),
        }),
      })
      setNewLineName('')
      setNewLinePct('5')
      try {
        await loadReserves()
      } catch (reloadErr) {
        setError(
          reloadErr instanceof ApiError
            ? `La línea se guardó, pero no se pudo refrescar la lista: ${reloadErr.message}`
            : 'La línea se guardó, pero no se pudo refrescar la lista.',
        )
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al guardar')
    } finally {
      setBusy(null)
    }
  }

  async function toggleLineActive(line: ReserveLine) {
    if (!canManage) return
    setBusy(line.id)
    try {
      await api(`/workshop-finance/reserve-lines/${line.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !line.isActive }),
      })
      await loadReserves()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error')
    } finally {
      setBusy(null)
    }
  }

  async function createDebt(e: FormEvent) {
    e.preventDefault()
    if (!canManage) return
    setBusy('debt')
    setError(null)
    try {
      await api('/workshop-finance/payables', {
        method: 'POST',
        body: JSON.stringify({
          creditorName: newDebtCreditor.trim(),
          initialAmount: newDebtAmount.replace(/\D/g, ''),
          description: newDebtDesc.trim() || undefined,
        }),
      })
      setNewDebtCreditor('')
      setNewDebtAmount('')
      setNewDebtDesc('')
      try {
        await loadDebts()
      } catch (reloadErr) {
        setError(
          reloadErr instanceof ApiError
            ? `La deuda se registró, pero no se pudo refrescar la lista: ${reloadErr.message}`
            : 'La deuda se registró, pero no se pudo refrescar la lista.',
        )
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al crear deuda')
    } finally {
      setBusy(null)
    }
  }

  async function submitPayment(e: FormEvent) {
    e.preventDefault()
    if (!payOpenId || !canManage) return
    setBusy('pay')
    setError(null)
    try {
      if (payMethod === 'CASH') {
        const cashOk = await refreshCashOpen()
        if (!cashOk) {
          setError(
            'No hay caja abierta: no podés registrar un egreso en efectivo. Abrí sesión desde el menú Caja o elegí transferencia / otro medio.',
          )
          return
        }
      }
      await api(`/workshop-finance/payables/${payOpenId}/payments`, {
        method: 'POST',
        body: JSON.stringify({
          amount: payAmount.replace(/\D/g, ''),
          method: payMethod,
          note: payNote.trim() || undefined,
        }),
      })
      setPayOpenId(null)
      setPayAmount('')
      setPayNote('')
      await loadDebts()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al registrar pago')
    } finally {
      setBusy(null)
    }
  }

  async function deleteSettledPayable(p: PayableRow) {
    if (!canManage || p.status !== 'SETTLED') return
    const ok = await confirmDeletePayable({
      title: 'Quitar deuda saldada',
      message:
        `¿Eliminar del listado la deuda con «${p.creditorName}»? Solo aplica cuando ya está saldada; ` +
        `los pagos registrados en caja no se borran.`,
      confirmLabel: 'Eliminar del listado',
      variant: 'danger',
    })
    if (!ok) return
    setBusy(`del:${p.id}`)
    setError(null)
    try {
      await api(`/workshop-finance/payables/${p.id}`, { method: 'DELETE' })
      await loadDebts()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo eliminar')
    } finally {
      setBusy(null)
    }
  }

  if (!canRead) {
    return (
      <div className="va-alert-error-block">
        No tenés permiso para ver finanzas del taller. Pedile a un administrador el permiso{' '}
        <code className="rounded bg-slate-200 px-1 dark:bg-slate-700">workshop_finance:read</code>.
      </div>
    )
  }

  return (
    <div className="space-y-6 lg:space-y-7">
      <PageHeader
        title="Finanzas del taller"
        description={
          <>
            <strong>Reservas teóricas:</strong> cada cierre de caja suma un % sobre el efectivo contado (no mueve
            caja). <strong>Deudas:</strong> cargá lo que debe el taller; el pago en efectivo genera egreso en caja. La{' '}
            <strong>apertura y el cierre de sesión</strong> de caja se hacen solo desde el menú <strong>Caja</strong>.
          </>
        }
      />

      <div className="va-tabstrip va-tabstrip--wrap w-full max-w-xl" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'reserves'}
          className={`va-tab ${tab === 'reserves' ? 'va-tab-active' : 'va-tab-inactive'}`}
          onClick={() => setTab('reserves')}
        >
          Reservas (cierre)
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'debts'}
          className={`va-tab ${tab === 'debts' ? 'va-tab-active' : 'va-tab-inactive'}`}
          onClick={() => setTab('debts')}
        >
          Deudas
        </button>
      </div>

      {error ? (
        <div className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-900 dark:border-rose-700 dark:bg-rose-950/35 dark:text-rose-100">
          {error}
        </div>
      ) : null}

      {loading ? <p className="text-sm text-slate-500 dark:text-slate-400">Cargando…</p> : null}

      {tab === 'reserves' && !loading && totals && (
        <div className="space-y-6">
          <section className={pageShell}>
            <h2 className="va-section-title">Totales acumulados por línea</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Suma de los aportes teóricos registrados en cada cierre de caja (base = efectivo contado al cerrar).
            </p>
            <ul className="mt-4 divide-y divide-slate-200 dark:divide-slate-700">
              {totals.map((row) => (
                <li key={row.line.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div>
                    <div className="font-medium text-slate-900 dark:text-slate-50">{row.line.name}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {row.line.percent}% · {row.line.isActive ? 'activa' : 'pausada'}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
                      {formatCop(row.accumulatedCop)}
                    </div>
                    {canManage ? (
                      <button
                        type="button"
                        onClick={() => void toggleLineActive(row.line)}
                        disabled={busy === row.line.id}
                        className="mt-1 text-xs text-brand-700 underline hover:no-underline dark:text-brand-300"
                      >
                        {row.line.isActive ? 'Pausar línea' : 'Reactivar'}
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {canManage ? (
            <section className={pageShell}>
              <h2 className="va-section-title">Agregar línea de reserva</h2>
              <form onSubmit={addLine} className="mt-4 flex flex-wrap items-end gap-3">
                <label className="block min-w-[10rem] flex-1">
                  <span className="va-label mb-1 block text-xs">Nombre</span>
                  <input
                    className="va-field w-full"
                    value={newLineName}
                    onChange={(e) => setNewLineName(e.target.value)}
                    placeholder="Ej. Equipamiento"
                    required
                  />
                </label>
                <label className="block w-28">
                  <span className="va-label mb-1 block text-xs">%</span>
                  <input
                    className="va-field w-full tabular-nums"
                    inputMode="decimal"
                    value={newLinePct}
                    onChange={(e) => setNewLinePct(e.target.value)}
                    required
                  />
                </label>
                <button type="submit" disabled={busy === 'line'} className="va-btn-primary">
                  {busy === 'line' ? 'Guardando…' : 'Agregar'}
                </button>
              </form>
            </section>
          ) : null}

          <section className={pageShell}>
            <h2 className="va-section-title">Últimos aportes por cierre</h2>
            {history && history.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">Aún no hay cierres registrados con líneas activas.</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs uppercase text-slate-500 dark:border-slate-700 dark:text-slate-400">
                      <th className="py-2 pr-3">Fecha cierre</th>
                      <th className="py-2 pr-3">Línea</th>
                      <th className="py-2 pr-3">Efectivo base</th>
                      <th className="py-2 pr-3">%</th>
                      <th className="py-2">Aporte</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {history?.map((h) => (
                      <tr key={h.id}>
                        <td className="py-2 pr-3 whitespace-nowrap text-slate-700 dark:text-slate-200">
                          {isoShort(h.sessionClosedAt ?? h.createdAt)}
                        </td>
                        <td className="py-2 pr-3">{h.lineName}</td>
                        <td className="py-2 pr-3 tabular-nums">{formatCop(h.baseCashCounted)}</td>
                        <td className="py-2 pr-3 tabular-nums">{h.percentApplied}%</td>
                        <td className="py-2 font-medium tabular-nums text-emerald-700 dark:text-emerald-300">
                          {formatCop(h.contributionAmount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {tab === 'debts' && !loading && payables && (
        <div className="space-y-6">
          {canManage ? (
            <section className={pageShell}>
              <h2 className="va-section-title">Nueva deuda</h2>
              <form onSubmit={createDebt} className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="sm:col-span-2">
                  <span className="va-label mb-1 block text-xs">Acreedor</span>
                  <input
                    className="va-field w-full"
                    value={newDebtCreditor}
                    onChange={(e) => setNewDebtCreditor(e.target.value)}
                    required
                  />
                </label>
                <label>
                  <span className="va-label mb-1 block text-xs">Monto inicial (COP)</span>
                  <input
                    className="va-field w-full tabular-nums"
                    inputMode="numeric"
                    value={newDebtAmount}
                    onChange={(e) => setNewDebtAmount(e.target.value)}
                    placeholder="ej. 2500000"
                    required
                  />
                </label>
                <label className="sm:col-span-2">
                  <span className="va-label mb-1 block text-xs">Nota (opcional)</span>
                  <input
                    className="va-field w-full"
                    value={newDebtDesc}
                    onChange={(e) => setNewDebtDesc(e.target.value)}
                  />
                </label>
                <div className="sm:col-span-2">
                  <button type="submit" disabled={busy === 'debt'} className="va-btn-primary">
                    {busy === 'debt' ? 'Guardando…' : 'Registrar deuda'}
                  </button>
                </div>
              </form>
            </section>
          ) : null}

          <section className={pageShell}>
            <h2 className="va-section-title">Deudas registradas</h2>
            {payables.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">No hay deudas cargadas.</p>
            ) : (
              <ul className="mt-4 space-y-4">
                {payables.map((p) => (
                  <li
                    key={p.id}
                    className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-600 dark:bg-slate-800/50"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-slate-50">{p.creditorName}</div>
                        {p.description ? (
                          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{p.description}</p>
                        ) : null}
                        <p className="mt-2 text-xs text-slate-500">
                          Inicial {formatCop(p.initialAmount)} · {p.status === 'OPEN' ? 'Abierta' : 'Saldada'}
                        </p>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-slate-500">Saldo</div>
                        <div className="text-xl font-bold tabular-nums text-slate-900 dark:text-slate-50">
                          {formatCop(p.balanceAmount)}
                        </div>
                        {canManage ? (
                          <div className="mt-2 flex flex-wrap justify-end gap-2">
                            {p.status === 'OPEN' ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setPayOpenId(p.id)
                                  setPayAmount(p.balanceAmount)
                                  setPayMethod('TRANSFER')
                                  setPayNote('')
                                }}
                                className="va-btn-primary !min-h-0 px-3 py-1.5 text-xs"
                              >
                                Registrar pago
                              </button>
                            ) : null}
                            {p.status === 'SETTLED' ? (
                              <button
                                type="button"
                                disabled={busy?.startsWith('del:')}
                                onClick={() => void deleteSettledPayable(p)}
                                className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-800 hover:bg-red-50 disabled:opacity-60 dark:border-red-800 dark:bg-slate-900 dark:text-red-100 dark:hover:bg-red-950/40"
                              >
                                {busy === `del:${p.id}` ? 'Eliminando…' : 'Quitar del listado'}
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </div>
                    {p.payments.length > 0 ? (
                      <ul className="mt-3 border-t border-slate-200 pt-3 text-xs dark:border-slate-600">
                        {p.payments.map((x) => (
                          <li key={x.id} className="flex justify-between gap-2 py-1">
                            <span>
                              {isoShort(x.createdAt)} · {x.method}
                              {x.note ? ` · ${x.note}` : ''}
                            </span>
                            <span className="tabular-nums font-medium">{formatCop(x.amount)}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {payOpenId ? (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 p-4 sm:items-center"
          role="dialog"
          aria-modal
          aria-labelledby="pay-modal-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-600 dark:bg-slate-900">
            <h2 id="pay-modal-title" className="text-lg font-semibold text-slate-900 dark:text-slate-50">
              Registrar pago
            </h2>
            <form onSubmit={submitPayment} className="mt-4 space-y-3">
              {cashSessionOpen !== true ? (
                <div className="rounded-lg border border-amber-400/60 bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:border-amber-700 dark:bg-amber-950/35 dark:text-amber-100">
                  <p>
                    Caja cerrada: el efectivo no está disponible hasta que alguien abra sesión desde el menú{' '}
                    <strong>Caja</strong>. Podés usar transferencia u otro medio sin tocar caja, o{' '}
                    <Link to={portalPath('/caja')} className="font-semibold text-amber-950 underline dark:text-amber-50">
                      ir a Caja para abrir sesión
                    </Link>
                    .
                  </p>
                  <button
                    type="button"
                    className="mt-2 rounded-lg border border-amber-800/40 bg-white/80 px-3 py-2 text-xs font-medium text-amber-950 hover:bg-white dark:border-amber-600/50 dark:bg-amber-950/50 dark:text-amber-100"
                    onClick={() => void refreshCashOpen()}
                  >
                    Actualizar estado (después de abrir en Caja)
                  </button>
                </div>
              ) : null}
              <label>
                <span className="va-label mb-1 block text-xs">Monto (COP)</span>
                <input
                  className="va-field w-full tabular-nums"
                  inputMode="numeric"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  required
                />
              </label>
              <label>
                <span className="va-label mb-1 block text-xs">Medio</span>
                <select
                  className="va-field w-full"
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value as typeof payMethod)}
                >
                  <option value="TRANSFER">Transferencia (no mueve caja)</option>
                  <option value="CASH" disabled={cashSessionOpen !== true}>
                    Efectivo — requiere caja abierta
                  </option>
                  <option value="OTHER">Otro</option>
                </select>
              </label>
              <label>
                <span className="va-label mb-1 block text-xs">Nota</span>
                <textarea className="va-field min-h-[72px] w-full" value={payNote} onChange={(e) => setPayNote(e.target.value)} />
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" className="va-btn-secondary" onClick={() => setPayOpenId(null)}>
                  Cancelar
                </button>
                <button type="submit" disabled={busy === 'pay'} className="va-btn-primary">
                  {busy === 'pay' ? 'Guardando…' : 'Confirmar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  )
}
