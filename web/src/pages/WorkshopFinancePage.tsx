import { Link } from 'react-router-dom'
import { PageHeader } from '../components/layout/PageHeader'
import { portalPath } from '../constants/portalPath'
import { formatWorkshopCop, useWorkshopFinancePageModel, workshopIsoShort } from '../features/workshop-finance'

export default function WorkshopFinancePage() {
  const m = useWorkshopFinancePageModel()

  if (!m.canRead) {
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
          aria-selected={m.tab === 'reserves'}
          className={`va-tab ${m.tab === 'reserves' ? 'va-tab-active' : 'va-tab-inactive'}`}
          onClick={() => m.setTab('reserves')}
        >
          Reservas (cierre)
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={m.tab === 'debts'}
          className={`va-tab ${m.tab === 'debts' ? 'va-tab-active' : 'va-tab-inactive'}`}
          onClick={() => m.setTab('debts')}
        >
          Deudas
        </button>
      </div>

      {m.error ? (
        <div className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-900 dark:border-rose-700 dark:bg-rose-950/35 dark:text-rose-100">
          {m.error}
        </div>
      ) : null}

      {m.loading ? <p className="text-sm text-slate-500 dark:text-slate-400">Cargando…</p> : null}

      {m.tab === 'reserves' && !m.loading && m.totals && (
        <div className="space-y-6">
          <section className={m.pageShell}>
            <h2 className="va-section-title">Totales acumulados por línea</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Suma de los aportes teóricos registrados en cada cierre de caja (base = efectivo contado al cerrar).
            </p>
            <ul className="mt-4 divide-y divide-slate-200 dark:divide-slate-700">
              {m.totals.map((row) => (
                <li key={row.line.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div>
                    <div className="font-medium text-slate-900 dark:text-slate-50">{row.line.name}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {row.line.percent}% · {row.line.isActive ? 'activa' : 'pausada'}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
                      {formatWorkshopCop(row.accumulatedCop)}
                    </div>
                    {m.canManage ? (
                      <button
                        type="button"
                        onClick={() => void m.toggleLineActive(row.line)}
                        disabled={m.busy === row.line.id}
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

          {m.canManage ? (
            <section className={m.pageShell}>
              <h2 className="va-section-title">Agregar línea de reserva</h2>
              <form onSubmit={m.addLine} className="mt-4 flex flex-wrap items-end gap-3">
                <label className="block min-w-[10rem] flex-1">
                  <span className="va-label mb-1 block text-xs">Nombre</span>
                  <input
                    className="va-field w-full"
                    value={m.newLineName}
                    onChange={(e) => m.setNewLineName(e.target.value)}
                    placeholder="Ej. Equipamiento"
                    required
                  />
                </label>
                <label className="block w-28">
                  <span className="va-label mb-1 block text-xs">%</span>
                  <input
                    className="va-field w-full tabular-nums"
                    inputMode="decimal"
                    value={m.newLinePct}
                    onChange={(e) => m.setNewLinePct(e.target.value)}
                    required
                  />
                </label>
                <button type="submit" disabled={m.busy === 'line'} className="va-btn-primary">
                  {m.busy === 'line' ? 'Guardando…' : 'Agregar'}
                </button>
              </form>
            </section>
          ) : null}

          <section className={m.pageShell}>
            <h2 className="va-section-title">Últimos aportes por cierre</h2>
            {m.history && m.history.length === 0 ? (
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
                    {m.history?.map((h) => (
                      <tr key={h.id}>
                        <td className="py-2 pr-3 whitespace-nowrap text-slate-700 dark:text-slate-200">
                          {workshopIsoShort(h.sessionClosedAt ?? h.createdAt)}
                        </td>
                        <td className="py-2 pr-3">{h.lineName}</td>
                        <td className="py-2 pr-3 tabular-nums">{formatWorkshopCop(h.baseCashCounted)}</td>
                        <td className="py-2 pr-3 tabular-nums">{h.percentApplied}%</td>
                        <td className="py-2 font-medium tabular-nums text-emerald-700 dark:text-emerald-300">
                          {formatWorkshopCop(h.contributionAmount)}
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

      {m.tab === 'debts' && !m.loading && m.payables && (
        <div className="space-y-6">
          {m.canManage ? (
            <section className={m.pageShell}>
              <h2 className="va-section-title">Nueva deuda</h2>
              <form onSubmit={m.createDebt} className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="sm:col-span-2">
                  <span className="va-label mb-1 block text-xs">Acreedor</span>
                  <input
                    className="va-field w-full"
                    value={m.newDebtCreditor}
                    onChange={(e) => m.setNewDebtCreditor(e.target.value)}
                    required
                  />
                </label>
                <label>
                  <span className="va-label mb-1 block text-xs">Monto inicial (COP)</span>
                  <input
                    className="va-field w-full tabular-nums"
                    inputMode="numeric"
                    value={m.newDebtAmount}
                    onChange={(e) => m.setNewDebtAmount(e.target.value)}
                    placeholder="ej. 2500000"
                    required
                  />
                </label>
                <label className="sm:col-span-2">
                  <span className="va-label mb-1 block text-xs">Nota (opcional)</span>
                  <input
                    className="va-field w-full"
                    value={m.newDebtDesc}
                    onChange={(e) => m.setNewDebtDesc(e.target.value)}
                  />
                </label>
                <div className="sm:col-span-2">
                  <button type="submit" disabled={m.busy === 'debt'} className="va-btn-primary">
                    {m.busy === 'debt' ? 'Guardando…' : 'Registrar deuda'}
                  </button>
                </div>
              </form>
            </section>
          ) : null}

          <section className={m.pageShell}>
            <h2 className="va-section-title">Deudas registradas</h2>
            {m.payables.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">No hay deudas cargadas.</p>
            ) : (
              <ul className="mt-4 space-y-4">
                {m.payables.map((p) => (
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
                          Inicial {formatWorkshopCop(p.initialAmount)} · {p.status === 'OPEN' ? 'Abierta' : 'Saldada'}
                        </p>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-slate-500">Saldo</div>
                        <div className="text-xl font-bold tabular-nums text-slate-900 dark:text-slate-50">
                          {formatWorkshopCop(p.balanceAmount)}
                        </div>
                        {m.canManage ? (
                          <div className="mt-2 flex flex-wrap justify-end gap-2">
                            {p.status === 'OPEN' ? (
                              <button
                                type="button"
                                onClick={() => m.openPayModal(p)}
                                className="va-btn-primary !min-h-0 px-3 py-1.5 text-xs"
                              >
                                Registrar pago
                              </button>
                            ) : null}
                            {p.status === 'SETTLED' ? (
                              <button
                                type="button"
                                disabled={m.busy?.startsWith('del:')}
                                onClick={() => void m.deleteSettledPayable(p)}
                                className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-800 hover:bg-red-50 disabled:opacity-60 dark:border-red-800 dark:bg-slate-900 dark:text-red-100 dark:hover:bg-red-950/40"
                              >
                                {m.busy === `del:${p.id}` ? 'Eliminando…' : 'Quitar del listado'}
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
                              {workshopIsoShort(x.createdAt)} · {x.method}
                              {x.note ? ` · ${x.note}` : ''}
                            </span>
                            <span className="tabular-nums font-medium">{formatWorkshopCop(x.amount)}</span>
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

      {m.payOpenId ? (
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
            <form onSubmit={m.submitPayment} className="mt-4 space-y-3">
              {m.cashSessionOpen !== true ? (
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
                    onClick={() => void m.refreshCashOpen()}
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
                  value={m.payAmount}
                  onChange={(e) => m.setPayAmount(e.target.value)}
                  required
                />
              </label>
              <label>
                <span className="va-label mb-1 block text-xs">Medio</span>
                <select
                  className="va-field w-full"
                  value={m.payMethod}
                  onChange={(e) => m.setPayMethod(e.target.value as typeof m.payMethod)}
                >
                  <option value="TRANSFER">Transferencia (no mueve caja)</option>
                  <option value="CASH" disabled={m.cashSessionOpen !== true}>
                    Efectivo — requiere caja abierta
                  </option>
                  <option value="OTHER">Otro</option>
                </select>
              </label>
              <label>
                <span className="va-label mb-1 block text-xs">Nota</span>
                <textarea className="va-field min-h-[72px] w-full" value={m.payNote} onChange={(e) => m.setPayNote(e.target.value)} />
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" className="va-btn-secondary" onClick={() => m.setPayOpenId(null)}>
                  Cancelar
                </button>
                <button type="submit" disabled={m.busy === 'pay'} className="va-btn-primary">
                  {m.busy === 'pay' ? 'Guardando…' : 'Confirmar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  )
}
