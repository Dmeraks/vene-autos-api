import { useEffect, useState } from 'react'
import type { CashTab } from '../types'

/**
 * Estado de UI para modales de apertura/cierre y sus campos.
 * Cierra modales al cambiar de pestaña para no dejar overlays “pegados”.
 */
export function useCashSessionModalDraft(activeTab: CashTab) {
  const [closeSessionModalOpen, setCloseSessionModalOpen] = useState(false)
  const [openSessionModalOpen, setOpenSessionModalOpen] = useState(false)

  const [openAmt, setOpenAmt] = useState('0')
  const [openNote, setOpenNote] = useState('')
  const [closeCounted, setCloseCounted] = useState('')
  const [closeDiff, setCloseDiff] = useState('')

  useEffect(() => {
    if (!closeSessionModalOpen) return
    setCloseCounted('')
    setCloseDiff('')
  }, [closeSessionModalOpen])

  useEffect(() => {
    if (!openSessionModalOpen) return
    setOpenAmt('0')
    setOpenNote('')
  }, [openSessionModalOpen])

  useEffect(() => {
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
