import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  formatCopFromString,
  normalizeMoneyDecimalStringForApi,
} from '../../../utils/copFormat'
import type { CashCategory } from '../types'

type MovementDir = 'income' | 'expense'

/**
 * Borrador local de ingreso/egreso: vive en paneles memoizados para no re-renderizar
 * `CashPage` en cada tecla.
 */
export function useCashMovementDraft(direction: MovementDir, categories: CashCategory[]) {
  const [movCat, setMovCat] = useState('')
  const [movAmt, setMovAmt] = useState('')
  const [movTender, setMovTender] = useState('')
  const [movNote, setMovNote] = useState('')
  const [movAck, setMovAck] = useState(false)
  const [movTwoCopies, setMovTwoCopies] = useState(false)

  /**
   * Misma pieza de estado `movCat` sirve para ingreso y egreso en la página completa;
   * aquí cada panel tiene su hook con `direction` fija.
   */
  useEffect(() => {
    const income = categories.filter((c) => c.direction === 'INCOME')
    const expense = categories.filter((c) => c.direction === 'EXPENSE')
    const list = direction === 'income' ? income : expense
    if (!list.length) return
    const ok = list.some((c) => c.slug === movCat)
    if (!ok || !movCat.trim()) {
      setMovCat(list[0].slug)
    }
  }, [direction, categories, movCat])

  useEffect(() => {
    setMovAck(false)
    setMovTender('')
  }, [direction, movCat])

  const movVueltoHint = useMemo(() => {
    const a = Number(normalizeMoneyDecimalStringForApi(movAmt) || movAmt.trim() || 0)
    const t = Number(normalizeMoneyDecimalStringForApi(movTender) || movTender.trim() || 0)
    if (!movTender.trim()) return null
    if (Number.isNaN(a) || Number.isNaN(t) || a <= 0) return 'Completá el importe del movimiento.'
    if (t < a) return 'El efectivo indicado debe ser mayor o igual al importe del movimiento.'
    const ch = t - a
    if (ch === 0) return 'Sin vuelto ($0): importe y efectivo coinciden.'
    const amt = `$${formatCopFromString(String(ch))}`
    return direction === 'income'
      ? `Vuelto a entregar al cliente: ${amt}.`
      : `Vuelto que vuelve a caja: ${amt}.`
  }, [direction, movAmt, movTender])

  const resetAfterSuccess = useCallback(() => {
    setMovAmt('')
    setMovTender('')
    setMovNote('')
    setMovAck(false)
    setMovTwoCopies(false)
  }, [])

  return {
    movCat,
    setMovCat,
    movAmt,
    setMovAmt,
    movTender,
    setMovTender,
    movNote,
    setMovNote,
    movAck,
    setMovAck,
    movTwoCopies,
    setMovTwoCopies,
    movVueltoHint,
    resetAfterSuccess,
  }
}
