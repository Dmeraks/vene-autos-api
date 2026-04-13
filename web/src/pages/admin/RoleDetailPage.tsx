import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../../api/client'
import { useAuth } from '../../auth/AuthContext'
import { CopyRolePermissionsBar, type RoleForPermissionCopy } from '../../components/CopyRolePermissionsBar'
import { useConfirm } from '../../components/confirm/ConfirmProvider'
import { PermissionPicker } from '../../components/PermissionPicker'
import { RoleProfileTemplatesPanel } from '../../components/RoleProfileTemplatesPanel'
import type { PermissionRow } from '../../api/types'

type RoleDetail = {
  id: string
  name: string
  slug: string
  isSystem: boolean
  description: string | null
  permissions: { permission: PermissionRow }[]
}

export function RoleDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { can } = useAuth()
  const confirm = useConfirm()
  const nav = useNavigate()
  const [role, setRole] = useState<RoleDetail | null>(null)
  const [perms, setPerms] = useState<PermissionRow[]>([])
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [msg, setMsg] = useState<string | null>(null)
  const [checkedTemplateIds, setCheckedTemplateIds] = useState<Set<string>>(new Set())
  const [roleSummaries, setRoleSummaries] = useState<RoleForPermissionCopy[]>([])

  useEffect(() => {
    if (!id) return
    let cancelled = false
    ;(async () => {
      try {
        const [r, p] = await Promise.all([
          api<RoleDetail>(`/roles/${id}`),
          api<PermissionRow[]>('/permissions'),
        ])
        let list: RoleForPermissionCopy[] = []
        try {
          list = await api<RoleForPermissionCopy[]>('/roles')
        } catch {
          list = []
        }
        if (cancelled) return
        setRole(r)
        setPerms(p)
        setRoleSummaries(list)
        setName(r.name)
        setDesc(r.description ?? '')
        setSel(new Set(r.permissions.map((x) => x.permission.id)))
        setCheckedTemplateIds(new Set())
      } catch {
        setMsg('Rol no encontrado')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [id])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!id || !can('roles:update')) return
    setMsg(null)
    const permissionIds = [...sel]
    if (permissionIds.length === 0) {
      setMsg('Elegí al menos un permiso')
      return
    }
    try {
      await api(`/roles/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: name.trim(),
          description: desc.trim() || null,
          permissionIds,
        }),
      })
      setMsg('Guardado')
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Error')
    }
  }

  async function remove() {
    if (!id || !role || !can('roles:delete')) return
    const ok = await confirm({
      title: 'Eliminar rol',
      message: `¿Eliminar el rol «${role.name}»? Solo debe usarse si el rol no tiene usuarios asignados.`,
      confirmLabel: 'Eliminar',
      variant: 'danger',
    })
    if (!ok) return
    try {
      await api(`/roles/${id}`, { method: 'DELETE' })
      nav('/admin/roles')
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'No se pudo eliminar')
    }
  }

  if (msg === 'Rol no encontrado' || (!role && msg)) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-800 dark:border-red-900/40 dark:bg-red-950/35 dark:text-red-200">
        {msg}
        <div className="mt-4">
          <Link to="/admin/roles" className="font-medium text-brand-800 underline">
            Volver a roles
          </Link>
        </div>
      </div>
    )
  }

  if (!role) return <p className="text-slate-500">Cargando…</p>

  return (
    <div className="space-y-6">
      <Link to="/admin/roles" className="text-sm font-medium text-brand-700 hover:underline">
        ← Roles
      </Link>
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">{role.name}</h1>
        <p className="font-mono text-sm text-slate-400">{role.slug}</p>
        {role.isSystem && (
          <p className="mt-2 text-sm text-amber-800 dark:text-amber-200">
            Rol de sistema: no se puede eliminar. Podés ajustar permisos si tu usuario lo permite.
          </p>
        )}
      </div>
      {msg && msg !== 'Rol no encontrado' && (
        <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200">
          {msg}
        </p>
      )}
      {can('roles:update') && (
        <form
          onSubmit={save}
          className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 dark:border-slate-600 dark:bg-slate-900"
        >
          <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            Los cambios aplican a todos los usuarios que tengan este rol al guardar.
          </p>
          <label className="block text-sm">
            <span className="text-slate-600 dark:text-slate-300">Nombre visible</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-600"
            />
          </label>
          <label className="block text-sm">
            <span className="text-slate-600 dark:text-slate-300">Descripción</span>
            <input
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-600"
            />
          </label>
          <CopyRolePermissionsBar roles={roleSummaries} excludeRoleId={id} setSel={setSel} />
          <RoleProfileTemplatesPanel
            permissions={perms}
            checkedTemplateIds={checkedTemplateIds}
            setCheckedTemplateIds={setCheckedTemplateIds}
            setSel={setSel}
          />
          <PermissionPicker permissions={perms} selectedIds={sel} onChange={setSel} />
          <button type="submit" className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white">
            Guardar cambios
          </button>
        </form>
      )}
      {can('roles:delete') && !role.isSystem && (
        <button
          type="button"
          onClick={() => void remove()}
          className="text-sm font-medium text-red-600 hover:underline"
        >
          Eliminar rol
        </button>
      )}
    </div>
  )
}
