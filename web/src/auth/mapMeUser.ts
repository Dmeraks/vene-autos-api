import type { AuthUser } from '../api/types'

export type MeApiUser = {
  id: string
  email: string
  fullName: string
  portalCustomerId?: string | null
  /** Lista canónica que coincide con el JWT (`JwtStrategy`); preferir sobre reconstruir desde `roles`. */
  effectivePermissions?: string[]
  roleSlugs?: string[]
  previewRole?: { id: string; slug: string; name: string } | null
  roles?: {
    role: {
      permissions?: { permission: { resource: string; action: string } }[]
    }
  }[]
}

export function mapMeToAuthUser(raw: MeApiUser): AuthUser {
  let permissions: string[]
  if (Array.isArray(raw.effectivePermissions)) {
    permissions = [...raw.effectivePermissions]
  } else {
    const set = new Set<string>()
    for (const link of raw.roles ?? []) {
      for (const rp of link.role.permissions ?? []) {
        const p = rp.permission
        set.add(`${p.resource}:${p.action}`)
      }
    }
    permissions = [...set]
  }

  return {
    id: raw.id,
    email: raw.email,
    fullName: raw.fullName,
    permissions,
    roleSlugs: raw.roleSlugs,
    previewRole: raw.previewRole ?? undefined,
    portalCustomerId: raw.portalCustomerId ?? null,
  }
}
