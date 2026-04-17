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
  refresh: () => Promise<void>
}

const CashSessionOpenContext = createContext<CashSessionOpenContextValue | null>(null)

export function CashSessionOpenProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [open, setOpen] = useState<boolean | null>(null)
  const [loadStatus, setLoadStatus] = useState<LoadStatus>('loading')

  const refresh = useCallback(async () => {
    setLoadStatus((s) => (s === 'ready' ? s : 'loading'))
    try {
      const r = await api<{ open: boolean }>('/cash/sessions/open-status')
      setOpen(Boolean(r.open))
      setLoadStatus('ready')
    } catch {
      setOpen(false)
      setLoadStatus('error')
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
