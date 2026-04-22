import { QueryClient } from '@tanstack/react-query'
import { STALE_OPERATIONAL_MS } from '../constants/queryStaleTime'

/**
 * FASE 1 — Configuración global de TanStack Query (instancia única en `main.tsx`).
 *
 * - `staleTime`: datos operativos frescos ~30s (`STALE_OPERATIONAL_MS`); cada query puede refinar.
 * - `retry`: 1 reintento en fallos de red (no en 4xx).
 * - `refetchOnWindowFocus: false` → evita ráfagas al volver a la pestaña; las queries que lo necesiten lo activan.
 * - `gcTime`: tiempo en memoria tras desmontaje (antes `cacheTime` en v4). Extendido a 15 min para reutilizar datos.
 *
 * Mutaciones sin reintento por defecto (acciones idempotentes se manejan en la UI).
 */
export function createAppQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: STALE_OPERATIONAL_MS,
        gcTime: 15 * 60_000, // Extendido: 15 min (antes 5 min). Reutiliza datos al volver rápido.
        retry: 1,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
      },
      mutations: {
        retry: 0,
      },
    },
  })
}
