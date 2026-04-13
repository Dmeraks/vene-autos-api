import type { AuthUser } from '../api/types'

export type MeApiUser = {
  id: string
  email: string
  fullName: string
  roles?: {
    role: {
      permissions?: { permission: { resource: string; action: string } }[]
    }
  }[]
}

export function mapMeToAuthUser(raw: MeApiUser): AuthUser {
  const permissions = new Set<string>()
  for (const link of raw.roles ?? []) {
    for (const rp of link.role.permissions ?? []) {
      const p = rp.permission
      permissions.add(`${p.resource}:${p.action}`)
    }
  }
  return {
    id: raw.id,
    email: raw.email,
    fullName: raw.fullName,
    permissions: [...permissions],
  }
}
