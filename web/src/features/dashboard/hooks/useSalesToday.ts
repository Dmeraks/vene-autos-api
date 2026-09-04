import { useAuth } from '../../../auth/AuthContext'

export type SalesTodayState = {
  loading: boolean
  error: string | null
  /** Total ingresos del día cuando se conecte a `GET /reports/economic-summary`. */
  incomeTotal: string | null
  fetchEnabled: boolean
}

/**
 * Hook reservado para ventas / ingresos del día (`reports:read`).
 * Por ahora **no lanza fetch** — evita acoplar el panel a una sola petición hasta definir widget y estrategia de cache (ej. TanStack Query).
 */
export function useSalesToday(options?: { enabled?: boolean }): SalesTodayState {
  const { can } = useAuth()
  const fetchEnabled = Boolean(options?.enabled) && can('reports:read')

  return {
    loading: false,
    error: null,
    incomeTotal: null,
    fetchEnabled,
  }
}
