import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { ApiError } from '../../api/client'
import { useAuth } from '../../auth/AuthContext'
import { useCashSessionOpen } from '../../context/CashSessionOpenContext'
import { useConfirm } from '../../components/confirm/ConfirmProvider'
import { panelUsesModernShell } from '../../config/operationalNotes'
import { usePanelTheme } from '../../theme/PanelThemeProvider'
import { describeWorkshopFinanceFailure } from './describeApiFailure'
import type {
  WorkshopPayableRow,
  WorkshopReserveContrib,
  WorkshopReserveLine,
  WorkshopReserveTotalRow,
} from './types'
import {
  createWorkshopPayable,
  createWorkshopPayablePayment,
  createWorkshopReserveLine,
  deleteWorkshopPayable,
  fetchWorkshopPayables,
  fetchWorkshopReserveContributions,
  fetchWorkshopReserveTotals,
  patchWorkshopReserveLine,
} from './workshopFinanceApi'

export function useWorkshopFinancePageModel() {
  const { can } = useAuth()
  const confirmDeletePayable = useConfirm()
  const { open: cashSessionOpen, refresh: refreshCashOpen } = useCashSessionOpen()
  const panelTheme = usePanelTheme()
  const isSaas = panelUsesModernShell(panelTheme)
  const canRead = can('workshop_finance:read')
  const canManage = can('workshop_finance:manage')

  const pageShell = isSaas
    ? 'va-saas-page-section rounded-2xl border border-slate-200/85 bg-[var(--va-surface-elevated)] p-4 shadow-sm sm:p-5 dark:border-slate-500/55 dark:bg-slate-900'
    : 'rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 dark:border-slate-700 dark:bg-slate-900'

  const [tab, setTab] = useState<'reserves' | 'debts'>('reserves')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [totals, setTotals] = useState<WorkshopReserveTotalRow[] | null>(null)
  const [history, setHistory] = useState<WorkshopReserveContrib[] | null>(null)
  const [payables, setPayables] = useState<WorkshopPayableRow[] | null>(null)

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

  useEffect(() => {
    if (payOpenId && cashSessionOpen !== true && payMethod === 'CASH') {
      setPayMethod('TRANSFER')
    }
  }, [cashSessionOpen, payMethod, payOpenId])

  const loadReserves = useCallback(async (): Promise<string[]> => {
    const errs: string[] = []
    try {
      setTotals(await fetchWorkshopReserveTotals())
    } catch (e) {
      errs.push(describeWorkshopFinanceFailure(e, 'Totales por línea'))
      setTotals([])
    }
    try {
      setHistory(await fetchWorkshopReserveContributions(40))
    } catch (e) {
      errs.push(describeWorkshopFinanceFailure(e, 'Historial de cierres'))
      setHistory([])
    }
    return errs
  }, [])

  const loadDebts = useCallback(async (): Promise<string[]> => {
    try {
      setPayables(await fetchWorkshopPayables())
      return []
    } catch (e) {
      setPayables([])
      return [describeWorkshopFinanceFailure(e, 'Lista de deudas')]
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
        if (!cancelled) setError(e instanceof ApiError ? e.message : 'No se pudo cargar.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [canRead, tab, loadReserves, loadDebts])

  const addLine = useCallback(
    async (e: FormEvent) => {
      e.preventDefault()
      if (!canManage) return
      setBusy('line')
      setError(null)
      try {
        await createWorkshopReserveLine({
          name: newLineName.trim(),
          percent: Number(newLinePct.replace(',', '.')),
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
    },
    [canManage, loadReserves, newLineName, newLinePct],
  )

  const toggleLineActive = useCallback(
    async (line: WorkshopReserveLine) => {
      if (!canManage) return
      setBusy(line.id)
      try {
        await patchWorkshopReserveLine(line.id, { isActive: !line.isActive })
        await loadReserves()
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Error')
      } finally {
        setBusy(null)
      }
    },
    [canManage, loadReserves],
  )

  const createDebt = useCallback(
    async (e: FormEvent) => {
      e.preventDefault()
      if (!canManage) return
      setBusy('debt')
      setError(null)
      try {
        await createWorkshopPayable({
          creditorName: newDebtCreditor.trim(),
          initialAmount: newDebtAmount.replace(/\D/g, ''),
          description: newDebtDesc.trim() || undefined,
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
    },
    [canManage, loadDebts, newDebtAmount, newDebtCreditor, newDebtDesc],
  )

  const submitPayment = useCallback(
    async (e: FormEvent) => {
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
        await createWorkshopPayablePayment(payOpenId, {
          amount: payAmount.replace(/\D/g, ''),
          method: payMethod,
          note: payNote.trim() || undefined,
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
    },
    [canManage, loadDebts, payAmount, payMethod, payNote, payOpenId, refreshCashOpen],
  )

  const deleteSettledPayable = useCallback(
    async (p: WorkshopPayableRow) => {
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
        await deleteWorkshopPayable(p.id)
        await loadDebts()
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'No se pudo eliminar')
      } finally {
        setBusy(null)
      }
    },
    [canManage, confirmDeletePayable, loadDebts],
  )

  const openPayModal = useCallback((p: WorkshopPayableRow) => {
    setPayOpenId(p.id)
    setPayAmount(p.balanceAmount)
    setPayMethod('TRANSFER')
    setPayNote('')
  }, [])

  return {
    canRead,
    canManage,
    pageShell,
    cashSessionOpen,
    refreshCashOpen,
    tab,
    setTab,
    loading,
    error,
    totals,
    history,
    payables,
    newLineName,
    setNewLineName,
    newLinePct,
    setNewLinePct,
    newDebtCreditor,
    setNewDebtCreditor,
    newDebtAmount,
    setNewDebtAmount,
    newDebtDesc,
    setNewDebtDesc,
    payOpenId,
    setPayOpenId,
    payAmount,
    setPayAmount,
    payMethod,
    setPayMethod,
    payNote,
    setPayNote,
    busy,
    addLine,
    toggleLineActive,
    createDebt,
    submitPayment,
    deleteSettledPayable,
    openPayModal,
  }
}
