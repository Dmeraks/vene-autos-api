import { api } from '../../api/client'

export type SettingsSupportUserRow = {
  id: string
  email: string
  fullName: string
  isActive: boolean
}

export function fetchSettingsTenantMap(signal?: AbortSignal): Promise<Record<string, unknown>> {
  return api<Record<string, unknown>>('/settings', { signal })
}

export async function fetchUsersListForQuery(signal?: AbortSignal): Promise<SettingsSupportUserRow[]> {
  const rows = await api<SettingsSupportUserRow[]>('/users', { signal })
  return Array.isArray(rows) ? rows : []
}
