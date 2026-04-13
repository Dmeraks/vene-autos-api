import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { useConfirm } from '../components/confirm/ConfirmProvider'
import { ExpenseRequestReviewModal } from '../components/ExpenseRequestReviewModal'
import { NotesMinCharCounter } from '../components/NotesMinCharCounter'
import {
  notesMinHint,
  parseNotesUiContext,
  SETTINGS_UI_CONTEXT_PATH,
  type SettingsUiContextResponse,
} from '../config/operationalNotes'

type Tab = 'sesion' | 'ingreso' | 'egreso' | 'delegados' | 'solicitudes'

type CashCategory = { id: string; slug: string; name: string; direction: string }

type SessionRow = {
  id: string
  status: string
  openingAmount: string
  openedAt: string
  closedAt: string | null
}

/** Resumen calculado en el API (apertura + ingresos − egresos de la sesión). */
type BalanceSummary = {
  totalIncome: string
  totalExpense: string
  expectedBalance: string
  movementCount: number
}

/** Coincide con `CASH_WORK_ORDER_REFERENCE_TYPE` en el API. */
const REF_WORK_ORDER = 'WorkOrder'
/** Coincide con `CASH_EXPENSE_REQUEST_REFERENCE_TYPE` en el API. */
const REF_EXPENSE_REQUEST = 'CashExpenseRequest'

type SessionMovementRow = {
  id: string
  direction: string
  amount: string
  referenceType: string | null
  referenceId: string | null
  note: string | null
  createdAt: string
  category: { slug: string; name: string }
  createdBy: { fullName: string; email: string }
}

/** Respuesta de `GET /cash/sessions/current` cuando hay sesión abierta. */
type CurrentSession = SessionRow & {
  balanceSummary?: BalanceSummary
  openedBy?: { id: string; email: string; fullName: string }
  movements?: SessionMovementRow[]
}

type ExpenseReq = {
  id: string
  status: string
  amount: string
  category: { slug: string; name: string }
  createdAt: string
  note: string | null
  requestedBy?: { id: string; email: string; fullName: string }
  isExpired?: boolean
}

type UserBrief = { id: string; email: string; fullName: string }

function sessionStatusEs(status: string): string {
  if (status === 'OPEN') return 'Abierta'
  if (status === 'CLOSED') return 'Cerrada'
  return status
}

function movementRefLabel(m: SessionMovementRow): { text: string; to?: string } {
  if (m.referenceType === REF_WORK_ORDER && m.referenceId) {
    return { text: 'Cobro de orden de trabajo', to: `/ordenes/${m.referenceId}` }
  }
  if (m.referenceType === REF_EXPENSE_REQUEST && m.referenceId) {
    return { text: 'Egreso por solicitud aprobada' }
  }
  if (m.referenceType?.trim() && m.referenceId?.trim()) {
    return { text: `${m.referenceType} · ${m.referenceId.slice(0, 8)}…` }
  }
  return { text: '—' }
}

function expenseStatusEs(status: string): string {
  const m: Record<string, string> = {
    PENDING: 'Pendiente',
    APPROVED: 'Aprobada',
    REJECTED: 'Rechazada',
    CANCELLED: 'Cancelada',
    EXPIRED: 'Expirada',
  }
  return m[status] ?? status
}

export function CashPage() {
  const { can, user } = useAuth()
  const confirm = useConfirm()
  const [tab, setTab] = useState<Tab>('sesion')
  const [msg, setMsg] = useState<string | null>(null)
  const [reviewRequestId, setReviewRequestId] = useState<string | null>(null)
  const [notesMin, setNotesMin] = useState(25)

  const [current, setCurrent] = useState<CurrentSession | null | undefined>(undefined)
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [categories, setCategories] = useState<CashCategory[]>([])
  const [users, setUsers] = useState<UserBrief[]>([])

  const [openAmt, setOpenAmt] = useState('0')
  const [openNote, setOpenNote] = useState('')
  const [closeCounted, setCloseCounted] = useState('')
  const [closeDiff, setCloseDiff] = useState('')

  const [movCat, setMovCat] = useState('')
  const [movAmt, setMovAmt] = useState('')
  const [movNote, setMovNote] = useState('')
  const [movAck, setMovAck] = useState(false)

  const [delSel, setDelSel] = useState<Set<string>>(new Set())

  const [reqList, setReqList] = useState<ExpenseReq[]>([])
  const [reqStatus, setReqStatus] = useState<string>('')
  const [reqCat, setReqCat] = useState('')
  const [reqAmt, setReqAmt] = useState('')
  const [reqNote, setReqNote] = useState('')

  const loadCore = useCallback(async () => {
    if (!can('cash_sessions:read')) return
    try {
      const cur = await api<CurrentSession | null>('/cash/sessions/current')
      setCurrent(cur)
      const list = await api<SessionRow[]>('/cash/sessions')
      setSessions(list)
    } catch {
      setCurrent(null)
    }
  }, [can])

  useEffect(() => {
    void loadCore()
  }, [loadCore])

  useEffect(() => {
    void api<SettingsUiContextResponse>(SETTINGS_UI_CONTEXT_PATH)
      .then((r) => setNotesMin(parseNotesUiContext(r).notesMinLengthChars))
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!can('cash_sessions:read')) return
    void api<CashCategory[]>('/cash/categories')
      .then(setCategories)
      .catch(() => undefined)
  }, [can])

  useEffect(() => {
    if (tab !== 'delegados' || !can('cash_delegates:manage')) return
    void Promise.all([
      api<UserBrief[]>('/users'),
      api<{ max: number; delegates: { user: { id: string } }[] }>('/cash/delegates').catch(() => ({
        max: 3,
        delegates: [] as { user: { id: string } }[],
      })),
    ])
      .then(([u, d]) => {
        setUsers(u)
        setDelSel(new Set(d.delegates.map((x) => x.user.id)))
      })
      .catch(() => undefined)
  }, [tab, can])

  useEffect(() => {
    if (tab !== 'solicitudes' || !can('cash_expense_requests:read')) return
    const q = reqStatus ? `?status=${encodeURIComponent(reqStatus)}` : ''
    void api<ExpenseReq[]>(`/cash/expense-requests${q}`)
      .then(setReqList)
      .catch(() => setReqList([]))
  }, [tab, reqStatus, can])

  useEffect(() => {
    const income = categories.filter((c) => c.direction === 'INCOME')
    if (income.length && !movCat) setMovCat(income[0].slug)
  }, [categories, movCat])

  useEffect(() => {
    setMovAck(false)
  }, [tab, movCat])

  function assertOperationalNote(label: string, raw: string): boolean {
    const t = raw.trim()
    if (t.length < notesMin) {
      setMsg(`${label}: necesitás al menos ${notesMin} caracteres (política del taller en Configuración).`)
      return false
    }
    return true
  }

  async function openSession(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    if (!assertOperationalNote('Nota de apertura de caja', openNote)) return
    const amt = openAmt.trim()
    const noteLine = `\nNota: ${openNote.trim()}`
    const msgOpen = `¿Abrir sesión de caja con monto inicial $${amt}?${noteLine}\n\nSolo podrás registrar movimientos con la sesión abierta. Revisá el monto antes de confirmar.`
    const ok = await confirm({
      title: 'Abrir sesión de caja',
      message: msgOpen,
      confirmLabel: 'Abrir sesión',
    })
    if (!ok) return
    try {
      await api('/cash/sessions/open', {
        method: 'POST',
        body: JSON.stringify({ openingAmount: openAmt.trim(), note: openNote.trim() }),
      })
      setMsg('Sesión abierta')
      await loadCore()
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Error')
    }
  }

  async function closeSession(e: React.FormEvent) {
    e.preventDefault()
    if (!current?.id) return
    setMsg(null)
    const counted = closeCounted.trim()
    const diffNote = closeDiff.trim()
    const summary = [
      '¿Cerrar la sesión de caja?',
      '',
      `Monto apertura: $${current.openingAmount}`,
      `Conteo físico (arqueo): $${counted}`,
      diffNote ? `Nota de diferencia: ${diffNote}` : '',
      '',
      'El cierre queda registrado. Si el conteo no coincide, aclarálo en la nota antes de confirmar.',
    ]
      .filter(Boolean)
      .join('\n')
    const okClose = await confirm({
      title: 'Cerrar sesión de caja',
      message: summary,
      confirmLabel: 'Cerrar sesión',
    })
    if (!okClose) return
    try {
      await api(`/cash/sessions/${current.id}/close`, {
        method: 'POST',
        body: JSON.stringify({
          closingCounted: closeCounted.trim(),
          differenceNote: closeDiff.trim() || undefined,
        }),
      })
      setMsg('Sesión cerrada')
      setCloseCounted('')
      setCloseDiff('')
      await loadCore()
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Error')
    }
  }

  async function movement(dir: 'income' | 'expense') {
    setMsg(null)
    if (!movAck) {
      setMsg('Marcá la casilla de confirmación abajo: revisaste categoría, monto y nota.')
      return
    }
    if (!assertOperationalNote(dir === 'income' ? 'Nota del ingreso' : 'Nota del egreso', movNote)) return
    const amt = movAmt.trim()
    const cat = categories.find((c) => c.slug === movCat)
    const catName = cat?.name ?? movCat
    const parts = [
      dir === 'income' ? '¿Registrar INGRESO en caja?' : '¿Registrar EGRESO de caja?',
      '',
      `Monto: $${amt}`,
      `Categoría: ${catName}`,
    ]
    parts.push(`Nota: ${movNote.trim()}`)
    if (dir === 'expense') parts.push('', '⚠ El egreso sale del efectivo de la sesión abierta.')
    parts.push('', 'Quedará registrado en el movimiento de la sesión.')
    const okMov = await confirm({
      title: dir === 'income' ? 'Registrar ingreso' : 'Registrar egreso',
      message: parts.join('\n'),
      confirmLabel: dir === 'income' ? 'Registrar ingreso' : 'Registrar egreso',
      variant: dir === 'expense' ? 'danger' : 'default',
    })
    if (!okMov) return
    try {
      await api(`/cash/movements/${dir}`, {
        method: 'POST',
        body: JSON.stringify({
          categorySlug: movCat,
          amount: movAmt.trim(),
          note: movNote.trim(),
        }),
      })
      setMsg(dir === 'income' ? 'Ingreso registrado' : 'Egreso registrado')
      setMovAmt('')
      setMovNote('')
      setMovAck(false)
      await loadCore()
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Error')
    }
  }

  async function saveDelegates(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    const picked = users.filter((u) => delSel.has(u.id))
    const names = picked.map((u) => u.fullName).join(', ') || '(ninguno)'
    const okDel = await confirm({
      title: 'Guardar delegados de egreso',
      message: `¿Guardar delegados de egreso?\n\nPersonas seleccionadas (${picked.length}/3): ${names}\n\nSolo ellas podrán registrar egresos directos según la política del taller.`,
      confirmLabel: 'Guardar lista',
    })
    if (!okDel) return
    try {
      await api('/cash/delegates', {
        method: 'PUT',
        body: JSON.stringify({ userIds: [...delSel] }),
      })
      setMsg('Delegados actualizados')
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Error')
    }
  }

  async function createRequest(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    const cat = expenseCats.find((c) => c.slug === reqCat)
    const catName = cat?.name ?? reqCat
    const okReq = await confirm({
      title: 'Solicitud de egreso',
      message: `¿Enviar solicitud de egreso?\n\nMonto: $${reqAmt.trim()}\nCategoría: ${catName}${reqNote.trim() ? `\nNota: ${reqNote.trim()}` : ''}\n\nUn aprobador deberá revisarla antes de que salga efectivo.`,
      confirmLabel: 'Enviar solicitud',
    })
    if (!okReq) return
    if (!assertOperationalNote('Nota de la solicitud de egreso', reqNote)) return
    try {
      await api('/cash/expense-requests', {
        method: 'POST',
        body: JSON.stringify({
          categorySlug: reqCat,
          amount: reqAmt.trim(),
          note: reqNote.trim(),
        }),
      })
      setReqAmt('')
      setReqNote('')
      setMsg('Solicitud creada')
      const q = reqStatus ? `?status=${encodeURIComponent(reqStatus)}` : ''
      setReqList(await api(`/cash/expense-requests${q}`))
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Error')
    }
  }

  async function refreshRequests() {
    const q = reqStatus ? `?status=${encodeURIComponent(reqStatus)}` : ''
    setReqList(await api(`/cash/expense-requests${q}`))
  }

  const allTabs: { id: Tab; label: string; show: boolean }[] = [
    { id: 'sesion', label: 'Sesión', show: can('cash_sessions:read') },
    { id: 'ingreso', label: 'Ingreso', show: can('cash_movements:create_income') },
    { id: 'egreso', label: 'Egreso', show: can('cash_movements:create_expense') },
    { id: 'delegados', label: 'Delegados', show: can('cash_delegates:manage') },
    { id: 'solicitudes', label: 'Solicitudes', show: can('cash_expense_requests:read') },
  ]
  const tabs = allTabs.filter((t) => t.show)

  const incomeCats = categories.filter((c) => c.direction === 'INCOME')
  const expenseCats = categories.filter((c) => c.direction === 'EXPENSE')

  const btnPrimary =
    'min-h-[44px] rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 sm:min-h-0'
  /** Fondo oscuro: fuerza texto blanco (el texto del padre .va-card en oscuro no debe heredarse). */
  const btnDark = `${btnPrimary} bg-slate-800 text-white hover:bg-slate-900 dark:bg-slate-600 dark:text-white dark:hover:bg-slate-500`
  const btnSecondary =
    'min-h-[44px] rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700 sm:min-h-0'

  return (
    <div className="space-y-5 sm:space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-50 sm:text-2xl">Caja</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Sesión del turno, ingresos, egresos y solicitudes. El <strong>saldo en efectivo según el sistema</strong> se
          muestra en la pestaña <strong>Sesión</strong> (apertura más movimientos registrados). Deslizá las pestañas en
          el celular si no entran todas.
        </p>
      </div>
      {current?.balanceSummary && tab !== 'sesion' && (
        <div className="rounded-xl border border-brand-200 bg-brand-50/90 px-4 py-3 text-sm text-brand-950 dark:border-brand-800 dark:bg-brand-950/35 dark:text-brand-100">
          <span className="font-medium">Sesión abierta:</span> saldo teórico en caja{' '}
          <span className="tabular-nums font-semibold">${current.balanceSummary.expectedBalance}</span>
          <span className="text-brand-800/80 dark:text-brand-200/90">
            {' '}
            ({current.balanceSummary.movementCount} movimientos registrados)
          </span>
          .{' '}
          <button
            type="button"
            className="font-semibold text-brand-800 underline decoration-brand-400 hover:no-underline dark:text-brand-200"
            onClick={() => setTab('sesion')}
          >
            Ver desglose en Sesión
          </button>
        </div>
      )}
      {msg && <p className="va-card-muted">{msg}</p>}

      {tabs.length > 0 && (
        <div className="va-tabstrip" role="tablist" aria-label="Secciones de caja">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`va-tab ${tab === t.id ? 'va-tab-active' : 'va-tab-inactive'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {tab === 'sesion' && can('cash_sessions:read') && (
        <div className="space-y-5 sm:space-y-6">
          <div className="va-card">
            <h2 className="font-semibold text-slate-900 dark:text-slate-50">Estado actual</h2>
            {current === undefined && (
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">Cargando…</p>
            )}
            {current === null && (
              <p className="mt-2 text-sm font-medium text-amber-800 dark:text-amber-200">No hay sesión abierta.</p>
            )}
            {current && (
              <>
                {current.balanceSummary && (
                  <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/90 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/40">
                    <p className="text-xs font-medium uppercase tracking-wide text-emerald-800 dark:text-emerald-200">
                      Saldo teórico en caja (según registros del sistema)
                    </p>
                    <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight text-emerald-950 dark:text-emerald-50">
                      ${current.balanceSummary.expectedBalance}
                    </p>
                    <p className="mt-2 text-xs leading-relaxed text-emerald-900/90 dark:text-emerald-100/90">
                      Es lo que <strong>debería</strong> haber en efectivo: apertura más todos los ingresos y menos todos
                      los egresos ya cargados en esta sesión. Si al contar billetes no coincide, en el cierre de sesión
                      se registra la diferencia y una nota (arqueo).
                    </p>
                    <dl className="mt-3 grid gap-2 text-sm text-emerald-950 dark:text-emerald-100 sm:grid-cols-3">
                      <div>
                        <dt className="text-xs text-emerald-800/90 dark:text-emerald-300/90">Apertura</dt>
                        <dd className="font-semibold tabular-nums">${current.openingAmount}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-emerald-800/90 dark:text-emerald-300/90">Ingresos registrados</dt>
                        <dd className="font-semibold tabular-nums">+ ${current.balanceSummary.totalIncome}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-emerald-800/90 dark:text-emerald-300/90">Egresos registrados</dt>
                        <dd className="font-semibold tabular-nums">− ${current.balanceSummary.totalExpense}</dd>
                      </div>
                    </dl>
                    <p className="mt-2 text-xs text-emerald-800/80 dark:text-emerald-300/80">
                      Movimientos en esta sesión: {current.balanceSummary.movementCount}
                    </p>
                  </div>
                )}
                <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                  <div className="rounded-lg border border-slate-100 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-slate-800/50">
                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Identificador interno
                    </dt>
                    <dd className="mt-1 break-all font-mono text-xs text-slate-800 dark:text-slate-200">{current.id}</dd>
                  </div>
                  <div className="rounded-lg border border-slate-100 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-slate-800/50">
                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Estado
                    </dt>
                    <dd className="mt-1 font-medium text-slate-900 dark:text-slate-50">{sessionStatusEs(current.status)}</dd>
                  </div>
                  {current.openedBy && (
                    <div className="rounded-lg border border-slate-100 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-slate-800/50 sm:col-span-2">
                      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Abierta por
                      </dt>
                      <dd className="mt-1 text-slate-800 dark:text-slate-200">
                        <span className="font-medium">{current.openedBy.fullName}</span>
                        <span className="text-slate-500 dark:text-slate-400"> · {current.openedBy.email}</span>
                      </dd>
                    </div>
                  )}
                  <div className="rounded-lg border border-slate-100 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-slate-800/50 sm:col-span-2">
                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Monto de apertura
                    </dt>
                    <dd className="mt-1 text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-50">
                      ${current.openingAmount}
                    </dd>
                  </div>
                </dl>

                <div className="mt-5 border-t border-slate-100 pt-5 dark:border-slate-800">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Movimientos de esta sesión</h3>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                    Si registraste un cobro desde una orden, el ingreso aparece aquí con vínculo a esa OT (referencia{' '}
                    <span className="font-mono">{REF_WORK_ORDER}</span> en el sistema). No hace falta volver a cargar el
                    ingreso en la pestaña «Ingreso» salvo cobros generales sin OT.
                  </p>
                  {current.movements && current.movements.length > 0 ? (
                    <div className="mt-3 overflow-x-auto rounded-xl border border-slate-100 dark:border-slate-800">
                      <table className="w-full min-w-[520px] text-left text-sm">
                        <thead>
                          <tr className="border-b border-slate-100 bg-slate-50/90 text-xs uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
                            <th className="px-3 py-2">Fecha</th>
                            <th className="px-3 py-2">Tipo</th>
                            <th className="px-3 py-2">Categoría</th>
                            <th className="px-3 py-2">Monto</th>
                            <th className="px-3 py-2">Vínculo</th>
                            <th className="px-3 py-2">Registró</th>
                          </tr>
                        </thead>
                        <tbody>
                          {current.movements.map((m) => {
                            const ref = movementRefLabel(m)
                            const isInc = m.direction === 'INCOME'
                            return (
                              <tr key={m.id} className="border-b border-slate-50 last:border-0 dark:border-slate-800/80">
                                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-slate-600 dark:text-slate-400">
                                  {new Date(m.createdAt).toLocaleString()}
                                </td>
                                <td className="px-3 py-2">
                                  <span
                                    className={
                                      isInc
                                        ? 'rounded-md bg-emerald-50 px-1.5 py-0.5 text-xs font-medium text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200'
                                        : 'rounded-md bg-rose-50 px-1.5 py-0.5 text-xs font-medium text-rose-900 dark:bg-rose-950/50 dark:text-rose-200'
                                    }
                                  >
                                    {isInc ? 'Ingreso' : 'Egreso'}
                                  </span>
                                </td>
                                <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{m.category.name}</td>
                                <td className="px-3 py-2 font-medium tabular-nums text-slate-900 dark:text-slate-50">
                                  ${m.amount}
                                </td>
                                <td className="max-w-[14rem] px-3 py-2 text-xs text-slate-600 dark:text-slate-300">
                                  {ref.to ? (
                                    <Link
                                      to={ref.to}
                                      className="font-medium text-brand-700 underline decoration-brand-300 hover:no-underline dark:text-brand-300"
                                    >
                                      {ref.text}
                                    </Link>
                                  ) : (
                                    <span>{ref.text}</span>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400">
                                  {m.createdBy.fullName}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Todavía no hay movimientos en esta sesión.</p>
                  )}
                </div>
              </>
            )}
          </div>

          {can('cash_sessions:open') && current === null && (
            <form onSubmit={openSession} className="va-card space-y-3 sm:max-w-md">
              <h2 className="font-semibold text-slate-900 dark:text-slate-50">Abrir sesión</h2>
              <label className="block">
                <span className="va-label">Monto inicial en caja</span>
                <input required value={openAmt} onChange={(e) => setOpenAmt(e.target.value)} className="va-field" />
              </label>
              <label className="block">
                <span className="va-label">Nota de apertura</span>
                <textarea
                  required
                  rows={3}
                  value={openNote}
                  onChange={(e) => setOpenNote(e.target.value)}
                  className="va-field resize-y"
                  placeholder="Ej. turno mañana, cajero Juan, fondo inicial acordado con el dueño…"
                />
                <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">{notesMinHint(notesMin)}</span>
                <NotesMinCharCounter value={openNote} minLength={notesMin} />
              </label>
              <button type="submit" className={btnPrimary}>
                Abrir caja
              </button>
            </form>
          )}

          {can('cash_sessions:close') && current && (
            <form onSubmit={closeSession} className="va-card space-y-3 sm:max-w-md">
              <h2 className="font-semibold text-slate-900 dark:text-slate-50">Cerrar sesión</h2>
              <label className="block">
                <span className="va-label">Conteo físico (arqueo)</span>
                <input required value={closeCounted} onChange={(e) => setCloseCounted(e.target.value)} className="va-field" />
              </label>
              <label className="block">
                <span className="va-label">Nota de diferencia o comentario de cierre</span>
                <textarea
                  rows={2}
                  value={closeDiff}
                  onChange={(e) => setCloseDiff(e.target.value)}
                  className="va-field resize-y"
                  placeholder="Si el arqueo no coincide con lo esperado, explicá el motivo con detalle."
                />
                <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                  Si escribís algo aquí, se exige al menos {notesMin} caracteres. Si el conteo coincide, podés dejarlo
                  vacío.
                </span>
                <NotesMinCharCounter value={closeDiff} minLength={notesMin} applicability="withGap" />
              </label>
              <button type="submit" className={btnDark}>
                Cerrar caja
              </button>
            </form>
          )}

          <div className="va-card">
            <h2 className="font-semibold text-slate-900 dark:text-slate-50">Últimas sesiones</h2>
            <ul className="mt-2 max-h-60 space-y-2 overflow-y-auto text-sm">
              {sessions.map((s) => (
                <li
                  key={s.id}
                  className="flex flex-col gap-0.5 border-b border-slate-100 py-2 last:border-0 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800"
                >
                  <span className="font-medium text-slate-900 dark:text-slate-100">{sessionStatusEs(s.status)}</span>
                  <span className="font-mono text-xs text-slate-600 dark:text-slate-400">
                    {new Date(s.openedAt).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {tab === 'ingreso' && can('cash_movements:create_income') && (
        <form
          className="va-card space-y-3 sm:max-w-md"
          onSubmit={(e) => {
            e.preventDefault()
            void movement('income')
          }}
        >
          <h2 className="font-semibold text-slate-900 dark:text-slate-50">Registrar ingreso</h2>
          <label className="block">
            <span className="va-label">Categoría</span>
            <select value={movCat} onChange={(e) => setMovCat(e.target.value)} className="va-field">
              {incomeCats.map((c) => (
                <option key={c.id} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="va-label">Monto</span>
            <input required value={movAmt} onChange={(e) => setMovAmt(e.target.value)} className="va-field" />
          </label>
          <label className="block">
            <span className="va-label">Nota del ingreso</span>
            <textarea
              required
              rows={2}
              value={movNote}
              onChange={(e) => setMovNote(e.target.value)}
              className="va-field resize-y"
              placeholder="Ej. cobro a cliente X por concepto…"
            />
            <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">{notesMinHint(notesMin)}</span>
            <NotesMinCharCounter value={movNote} minLength={notesMin} />
          </label>
          <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-brand-600 dark:border-slate-500"
              checked={movAck}
              onChange={(e) => setMovAck(e.target.checked)}
            />
            <span>Confirmo categoría, monto y nota antes de registrar el ingreso.</span>
          </label>
          <button type="submit" className={btnPrimary}>
            Registrar ingreso
          </button>
        </form>
      )}

      {tab === 'egreso' && can('cash_movements:create_expense') && (
        <form
          className="va-card space-y-3 sm:max-w-md"
          onSubmit={(e) => {
            e.preventDefault()
            void movement('expense')
          }}
        >
          <h2 className="font-semibold text-slate-900 dark:text-slate-50">Registrar egreso</h2>
          <label className="block">
            <span className="va-label">Categoría</span>
            <select
              value={expenseCats.some((c) => c.slug === movCat) ? movCat : (expenseCats[0]?.slug ?? '')}
              onChange={(e) => setMovCat(e.target.value)}
              className="va-field"
            >
              {expenseCats.map((c) => (
                <option key={c.id} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="va-label">Monto</span>
            <input required value={movAmt} onChange={(e) => setMovAmt(e.target.value)} className="va-field" />
          </label>
          <label className="block">
            <span className="va-label">Nota del egreso</span>
            <textarea
              required
              rows={2}
              value={movNote}
              onChange={(e) => setMovNote(e.target.value)}
              className="va-field resize-y"
              placeholder="Ej. compra de insumos, pago a proveedor…"
            />
            <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">{notesMinHint(notesMin)}</span>
            <NotesMinCharCounter value={movNote} minLength={notesMin} />
          </label>
          <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-brand-600 dark:border-slate-500"
              checked={movAck}
              onChange={(e) => setMovAck(e.target.checked)}
            />
            <span>Confirmo categoría, monto y nota antes de registrar el egreso.</span>
          </label>
          <button type="submit" className={btnDark}>
            Registrar egreso
          </button>
        </form>
      )}

      {tab === 'delegados' && can('cash_delegates:manage') && (
        <form onSubmit={saveDelegates} className="va-card">
          <h2 className="font-semibold text-slate-900 dark:text-slate-50">Delegados de egreso (máx. 3)</h2>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
            Solo estas personas pueden registrar egresos directos, según la política del taller.
          </p>
          <div className="mt-3 max-h-72 space-y-2 overflow-y-auto rounded-xl border border-slate-100 p-2 dark:border-slate-800">
            {users.map((u) => (
              <label
                key={u.id}
                className="flex min-h-[48px] cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/80"
              >
                <input
                  type="checkbox"
                  className="h-5 w-5 rounded border-slate-300 text-brand-600 dark:border-slate-500"
                  checked={delSel.has(u.id)}
                  onChange={() => {
                    setDelSel((prev) => {
                      const n = new Set(prev)
                      if (n.has(u.id)) n.delete(u.id)
                      else if (n.size < 3) n.add(u.id)
                      return n
                    })
                  }}
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-medium text-slate-900 dark:text-slate-100">{u.fullName}</span>
                  <span className="truncate text-xs text-slate-500 dark:text-slate-400">{u.email}</span>
                </span>
              </label>
            ))}
          </div>
          <button type="submit" className={`${btnPrimary} mt-4`}>
            Guardar lista
          </button>
        </form>
      )}

      {tab === 'solicitudes' && can('cash_expense_requests:read') && (
        <div className="space-y-5">
          <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
            Para aprobar, rechazar o cancelar una solicitud pendiente, usá <strong>Ver detalle</strong>: se abre
            una pantalla con solicitante, monto y nota, y los botones de decisión solo aparecen ahí (así se evitan
            errores al tocar sin leer).
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <label className="block min-w-0 flex-1 sm:max-w-xs">
              <span className="va-label">Filtrar por estado</span>
              <select value={reqStatus} onChange={(e) => setReqStatus(e.target.value)} className="va-field">
                <option value="">Todos</option>
                <option value="PENDING">Pendiente</option>
                <option value="APPROVED">Aprobada</option>
                <option value="REJECTED">Rechazada</option>
                <option value="CANCELLED">Cancelada</option>
                <option value="EXPIRED">Expirada</option>
              </select>
            </label>
            <button type="button" onClick={() => void refreshRequests()} className={btnSecondary}>
              Refrescar lista
            </button>
          </div>

          {can('cash_expense_requests:create') && (
            <form onSubmit={createRequest} className="va-card space-y-3 sm:max-w-md">
              <h2 className="font-semibold text-slate-900 dark:text-slate-50">Nueva solicitud de egreso</h2>
              <select value={reqCat} onChange={(e) => setReqCat(e.target.value)} className="va-field" required>
                <option value="">Elegí categoría…</option>
                {expenseCats.map((c) => (
                  <option key={c.id} value={c.slug}>
                    {c.name}
                  </option>
                ))}
              </select>
              <input
                required
                placeholder="Monto"
                value={reqAmt}
                onChange={(e) => setReqAmt(e.target.value)}
                className="va-field mt-0"
              />
              <textarea
                required
                rows={2}
                placeholder="Motivo y detalle del egreso solicitado"
                value={reqNote}
                onChange={(e) => setReqNote(e.target.value)}
                className="va-field mt-0 resize-y"
              />
              <p className="text-xs text-slate-500 dark:text-slate-400">{notesMinHint(notesMin)}</p>
              <NotesMinCharCounter value={reqNote} minLength={notesMin} />
              <button type="submit" className={btnPrimary}>
                Enviar solicitud
              </button>
            </form>
          )}

          <div className="grid gap-3 md:hidden">
            {reqList.map((r) => (
              <div key={r.id} className="va-card !p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {new Date(r.createdAt).toLocaleString()}
                    </p>
                    <p className="mt-1 font-semibold text-slate-900 dark:text-slate-50">{r.category.name}</p>
                    <p className="text-lg font-bold tabular-nums text-slate-900 dark:text-slate-50">${String(r.amount)}</p>
                    {r.requestedBy && (
                      <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                        Solicita: <span className="font-medium text-slate-800 dark:text-slate-200">{r.requestedBy.fullName}</span>
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-800 dark:bg-slate-800 dark:text-slate-200">
                    {expenseStatusEs(r.status)}
                    {r.status === 'PENDING' && r.isExpired && ' · vencida'}
                  </span>
                </div>
                {r.note && (
                  <p className="mt-2 line-clamp-2 text-sm text-slate-600 dark:text-slate-400">{r.note}</p>
                )}
                <button
                  type="button"
                  className={`${btnSecondary} mt-3 w-full border-brand-200 text-brand-800 dark:border-brand-800 dark:text-brand-200`}
                  onClick={() => setReviewRequestId(r.id)}
                >
                  Ver detalle
                </button>
              </div>
            ))}
          </div>

          <div className="va-card-flush hidden overflow-x-auto md:block">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/90 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-400">
                  <th className="px-3 py-3">Fecha</th>
                  <th className="px-3 py-3">Solicita</th>
                  <th className="px-3 py-3">Estado</th>
                  <th className="px-3 py-3">Monto</th>
                  <th className="px-3 py-3"> </th>
                </tr>
              </thead>
              <tbody>
                {reqList.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-slate-600 dark:text-slate-400">
                      {new Date(r.createdAt).toLocaleString()}
                    </td>
                    <td className="max-w-[10rem] truncate px-3 py-2.5 text-sm text-slate-800 dark:text-slate-200">
                      {r.requestedBy?.fullName ?? '—'}
                    </td>
                    <td className="px-3 py-2.5 font-medium text-slate-900 dark:text-slate-100">
                      {expenseStatusEs(r.status)}
                      {r.status === 'PENDING' && r.isExpired && (
                        <span className="ml-1 text-xs font-normal text-amber-700 dark:text-amber-300">(vencida)</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums text-slate-900 dark:text-slate-50">${String(r.amount)}</td>
                    <td className="px-3 py-2.5">
                      <button
                        type="button"
                        className="text-xs font-semibold text-brand-700 underline dark:text-brand-300"
                        onClick={() => setReviewRequestId(r.id)}
                      >
                        Ver detalle
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ExpenseRequestReviewModal
        requestId={reviewRequestId}
        open={reviewRequestId !== null}
        notesMinLength={notesMin}
        currentUserId={user?.id}
        canApprove={can('cash_expense_requests:approve')}
        canReject={can('cash_expense_requests:reject')}
        canCancel={can('cash_expense_requests:cancel')}
        onClose={() => setReviewRequestId(null)}
        onDone={() => void refreshRequests()}
        setBanner={setMsg}
      />
    </div>
  )
}
