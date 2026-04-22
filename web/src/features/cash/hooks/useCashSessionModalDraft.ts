import { useEffect, useState } from 'react'
import type { CashTab } from '../types'

/**
 * Estado de UI para modales de apertura/cierre y sus campos.
 * Cierra modales al cambiar de pestaña para no dejar overlays "pegados".
 */
export function useCashSessionModalDraft(activeTab: CashTab) {
  const [closeSessionModalOpen, setCloseSessionModalOpen] = useState(false)
  const [openSessionModalOpen, setOpenSessionModalOpen] = useState(false)

  const [openAmt, setOpenAmt] = useState('0')
  const [openNote, setOpenNote] = useState('')
  const [closeCounted, setCloseCounted] = useState('')
  const [closeDiff, setCloseDiff] = useState('')

  // Resetear estado al cerrar el modal (si aplica)
  // No setear en effect; dejar que los handlers del modal lo manejen
  // o usar derived state basado en el booleano

  useEffect(() => {
    // Al cambiar de pestaña, cerrar ambos modales
    setCloseSessionModalOpen(false)
    setOpenSessionModalOpen(false)
  }, [activeTab])

  return {
    closeSessionModalOpen,
    setCloseSessionModalOpen,
    openSessionModalOpen,
    setOpenSessionModalOpen,
    openAmt,
    setOpenAmt,
    openNote,
    setOpenNote,
    closeCounted,
    setCloseCounted,
    closeDiff,
    setCloseDiff,
  }
}
