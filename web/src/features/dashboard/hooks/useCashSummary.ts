import { useMemo } from 'react'
import { useCashSessionOpen } from '../../../context/CashSessionOpenContext'

/**
 * Estado de caja abierta/cerrada para widgets del panel (usa el mismo fetch que el resto de la app).
 */
export function useCashSummary() {
  const v = useCashSessionOpen()
  return useMemo(
    () => ({
      open: v.open,
      loadStatus: v.loadStatus,
      refresh: v.refresh,
    }),
    [v.open, v.loadStatus, v.refresh],
  )
}
