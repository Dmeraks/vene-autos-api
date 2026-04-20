import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'

type LoadStatus = 'loading' | 'ready' | 'error'

type CashSessionOpenContextValue = {
  /** `null` mientras carga la primera vez */
  open: boolean | null
  loadStatus: LoadStatus
  /** Devuelve si hay caja abierta tras refrescar (útil para validar justo antes de un POST). */
  refresh: () => Promise<boolean>
}

const CashSessionOpenContext = createContext<CashSessionOpenContextValue | null>(null)

export function CashSessionOpenProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [open, setOpen] = useState<boolean | null>(null)
  const [loadStatus, setLoadStatus] = useState<LoadStatus>('loading')

  const refresh = useCallback(async (): Promise<boolean> => {
    setLoadStatus((s) => (s === 'ready' ? s : 'loading'))
    try {
      const r = await api<{ open: boolean }>('/cash/sessions/open-status')
      const isOpen = Boolean(r.open)
      setOpen(isOpen)
      setLoadStatus('ready')
      return isOpen
    } catch {
      setOpen(false)
      setLoadStatus('error')
      return false
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh, user?.id])

  useEffect(() => {
    const id = window.setInterval(() => void refresh(), 45_000)
    const onVis = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [refresh])

  const value = useMemo(() => ({ open, loadStatus, refresh }), [open, loadStatus, refresh])

  return <CashSessionOpenContext.Provider value={value}>{children}</CashSessionOpenContext.Provider>
}

export function useCashSessionOpen(): CashSessionOpenContextValue {
  const ctx = useContext(CashSessionOpenContext)
  if (!ctx) {
    throw new Error('useCashSessionOpen debe usarse dentro de CashSessionOpenProvider')
  }
  return ctx
}
