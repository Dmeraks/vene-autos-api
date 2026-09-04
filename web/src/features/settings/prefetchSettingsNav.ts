import type { QueryClient } from '@tanstack/react-query'
import { STALE_SETTINGS_ADMIN_MS } from '../../constants/queryStaleTime'
import { queryKeys } from '../../lib/queryKeys'
import { fetchSettingsTenantMap, fetchUsersListForQuery } from './settingsTenantApi'

const SETTINGS_QUERY_GC_MS = 45 * 60_000

/** Hover en «Configuración»: el formulario puede hidratarse desde caché al entrar. */
export function prefetchSettingsAdminPanel(
  queryClient: QueryClient,
  opts?: { prefetchUsersList?: boolean },
): void {
  void queryClient.prefetchQuery({
    queryKey: queryKeys.settings.tenantMap(),
    queryFn: ({ signal }) => fetchSettingsTenantMap(signal),
    staleTime: STALE_SETTINGS_ADMIN_MS,
    gcTime: SETTINGS_QUERY_GC_MS,
  })
  if (opts?.prefetchUsersList) {
    void queryClient.prefetchQuery({
      queryKey: queryKeys.users.list(),
      queryFn: ({ signal }) => fetchUsersListForQuery(signal),
      staleTime: STALE_SETTINGS_ADMIN_MS,
      gcTime: SETTINGS_QUERY_GC_MS,
    })
  }
}
