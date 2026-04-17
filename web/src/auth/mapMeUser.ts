import type { AuthUser } from '../api/types'

export type MeApiUser = {
  id: string
  email: string
  fullName: string
  portalCustomerId?: string | null
  /** Slugs de roles en BD (para UX por perfil, p. ej. vista cajero en OT). */
  roleSlugs?: string[]
  /** Si viene del API, sustituye el agregado desde `roles` (vista por rol). */
  effectivePermissions?: string[]
  previewRole?: { id: string; slug: string; name: string } | null
  roles?: {
    role: {
      permissions?: { permission: { resource: string; action: string } }[]
    }
  }[]
}

export function mapMeToAuthUser(raw: MeApiUser): AuthUser {
  let permissions: string[]
  if (raw.effectivePermissions && raw.effectivePermissions.length > 0) {
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
