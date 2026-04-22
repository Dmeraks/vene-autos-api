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
  const [movCat, setMovCat] = useState(() => {
    const income = categories.filter((c) => c.direction === 'INCOME')
    const expense = categories.filter((c) => c.direction === 'EXPENSE')
    const list = direction === 'income' ? income : expense
    return list[0]?.slug ?? ''
  })
  const [movAmt, setMovAmt] = useState('')
  const [movTender, setMovTender] = useState('')
  const [movNote, setMovNote] = useState('')
  const [movAck, setMovAck] = useState(false)
  const [movTwoCopies, setMovTwoCopies] = useState(false)

  /**
   * Validar que la categoría siga siendo válida cuando cambia direction o categories.
   * Usar useEffect solo para lógica, no para setState.
   */
  useEffect(() => {
    const income = categories.filter((c) => c.direction === 'INCOME')
    const expense = categories.filter((c) => c.direction === 'EXPENSE')
    const list = direction === 'income' ? income : expense
    if (!list.length) return
    const ok = list.some((c) => c.slug === movCat)
    if (!ok) {
      setMovCat(list[0].slug)
    }
  }, [direction, categories, movCat])

  useEffect(() => {
    // Resetear estado dependiente sin setState sincrónico
    // Usar event callback en lugar de effect
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
