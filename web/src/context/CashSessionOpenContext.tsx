import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { STALE_OPERATIONAL_MS } from '../constants/queryStaleTime'
import { useAuth } from '../auth/AuthContext'
import { queryKeys } from '../lib/queryKeys'
import { fetchCashSessionOpenStatus } from '../services/fetchCashSessionOpenStatus'

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
  const queryClient = useQueryClient()
  const queryKey = useMemo(() => queryKeys.cash.openStatusForUser(user?.id), [user?.id])

  const query = useQuery({
    queryKey,
    queryFn: fetchCashSessionOpenStatus,
    /** Alineado con integración previa: menos requests duplicados entre montajes. */
    staleTime: STALE_OPERATIONAL_MS,
    /** Misma cadencia que el `setInterval` anterior (45s). */
    refetchInterval: 45_000,
    refetchIntervalInBackground: true,
  })

  /** Al volver a la pestaña: mismo comportamiento que `visibilitychange` + refresh manual. */
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        void queryClient.invalidateQueries({ queryKey })
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [queryClient, queryKey])

  const open = useMemo((): boolean | null => {
    if (query.isError) return false
    if (query.isPending && query.data === undefined) return null
    return query.data ?? null
  }, [query.isError, query.isPending, query.data])

  const loadStatus = useMemo((): LoadStatus => {
    if (query.isError) return 'error'
    if (query.isPending && query.data === undefined) return 'loading'
    return 'ready'
  }, [query.isError, query.isPending, query.data])

  const refresh = useCallback(async (): Promise<boolean> => {
    try {
      const result = await query.refetch()
      if (result.isError) return false
      return Boolean(result.data)
    } catch {
      return false
    }
  }, [query.refetch])

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
