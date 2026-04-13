import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import { useAuth } from '../../auth/AuthContext'
import { useConfirm } from '../../components/confirm/ConfirmProvider'

type RoleBrief = { id: string; name: string; slug: string }
type UserRow = {
  id: string
  email: string
  fullName: string
  isActive: boolean
  roles: { role: RoleBrief }[]
}

export function UsersPage() {
  const { can } = useAuth()
  const confirm = useConfirm()
  const [rows, setRows] = useState<UserRow[] | null>(null)
  const [roles, setRoles] = useState<RoleBrief[]>([])
  const [msg, setMsg] = useState<string | null>(null)

  const [modal, setModal] = useState<'create' | 'edit' | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [roleIds, setRoleIds] = useState<Set<string>>(new Set())
  const [isActive, setIsActive] = useState(true)
  const [editInitial, setEditInitial] = useState<{ roleIds: string[]; isActive: boolean } | null>(null)

  async function load() {
    const [u, r] = await Promise.all([
      api<UserRow[]>('/users'),
      api<{ id: string; name: string; slug: string }[]>('/roles'),
    ])
    setRows(u)
    setRoles(r)
  }

  useEffect(() => {
    void load().catch(() => setMsg('Error al cargar usuarios'))
  }, [])

  function openCreate() {
    setModal('create')
    setEditId(null)
    setEditInitial(null)
    setEmail('')
    setPassword('')
    setFullName('')
    setRoleIds(new Set())
    setIsActive(true)
  }

  function openEdit(u: UserRow) {
    setModal('edit')
    setEditId(u.id)
    setEmail(u.email)
    setPassword('')
    setFullName(u.fullName)
    const rids = u.roles.map((x) => x.role.id)
    setRoleIds(new Set(rids))
    setIsActive(u.isActive)
    setEditInitial({ roleIds: [...rids], isActive: u.isActive })
  }

  function toggleRole(id: string) {
    setRoleIds((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  function sameRoleSet(a: string[], b: string[]) {
    if (a.length !== b.length) return false
    const sa = [...a].sort()
    const sb = [...b].sort()
    return sa.every((x, i) => x === sb[i])
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    const rids = [...roleIds]
    if (rids.length === 0) {
      setMsg('Elegí al menos un rol')
      return
    }
    const roleNames = rids
      .map((id) => roles.find((r) => r.id === id)?.name)
      .filter(Boolean)
      .join(', ')
    if (modal === 'create') {
      const okCreate = await confirm({
        title: 'Crear usuario',
        message: `¿Crear usuario?\n\nCorreo: ${email.trim()}\nNombre: ${fullName.trim()}\nRoles: ${roleNames}\n\nRevisá el correo y los permisos antes de confirmar.`,
        confirmLabel: 'Crear usuario',
      })
      if (!okCreate) return
    } else if (modal === 'edit' && editInitial) {
      const rolesChanged = !sameRoleSet(editInitial.roleIds, rids)
      const deactivate = editInitial.isActive && !isActive
      if (rolesChanged || deactivate) {
        const parts = ['¿Guardar cambios en el usuario?', '', `Nombre: ${fullName.trim()}`, `Correo: ${email}`]
        if (deactivate) parts.push('', '⚠ El usuario quedará INACTIVO y no podrá ingresar.')
        if (rolesChanged) parts.push('', `Roles nuevos: ${roleNames}`)
        parts.push('', 'Los permisos afectan acceso a caja, órdenes y administración.')
        const okEdit = await confirm({
          title: 'Cambios sensibles en el usuario',
          message: parts.join('\n'),
          confirmLabel: 'Guardar',
          variant: deactivate ? 'danger' : 'default',
        })
        if (!okEdit) return
      }
    }
    try {
      if (modal === 'create') {
        await api('/users', {
          method: 'POST',
          body: JSON.stringify({
            email: email.trim(),
            password,
            fullName: fullName.trim(),
            roleIds: rids,
          }),
        })
        setMsg('Usuario creado')
      } else if (editId) {
        const body: Record<string, unknown> = {
          fullName: fullName.trim(),
          roleIds: rids,
        }
        if (can('users:deactivate')) {
          body.isActive = isActive
        }
        await api(`/users/${editId}`, { method: 'PATCH', body: JSON.stringify(body) })
        setMsg('Usuario actualizado')
      }
      setModal(null)
      await load()
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Error')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
            Usuarios
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Alta, roles y estado de acceso.</p>
        </div>
        {can('users:create') && (
          <button
            type="button"
            onClick={openCreate}
            className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Nuevo usuario
          </button>
        )}
      </div>
      {msg && <p className="va-card-muted">{msg}</p>}
      {!rows && <p className="text-slate-500 dark:text-slate-400">Cargando…</p>}
      {rows && (
        <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-500">
                  <th className="px-4 py-3 sm:px-6">Nombre</th>
                  <th className="px-4 py-3 sm:px-6">Correo</th>
                  <th className="px-4 py-3 sm:px-6">Roles</th>
                  <th className="px-4 py-3 sm:px-6">Activo</th>
                  <th className="px-4 py-3 sm:px-6" />
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u.id} className="border-b border-slate-50 last:border-0 dark:border-slate-800/80">
                    <td className="px-4 py-3 font-medium text-slate-900 sm:px-6 dark:text-slate-50">{u.fullName}</td>
                    <td className="px-4 py-3 text-slate-600 sm:px-6 dark:text-slate-300">{u.email}</td>
                    <td className="px-4 py-3 text-xs text-slate-500 sm:px-6 dark:text-slate-400">
                      {u.roles.map((r) => r.role.name).join(', ') || '—'}
                    </td>
                    <td className="px-4 py-3 sm:px-6">{u.isActive ? 'Sí' : 'No'}</td>
                    <td className="px-4 py-3 sm:px-6">
                      {can('users:update') && (
                        <button
                          type="button"
                          onClick={() => openEdit(u)}
                          className="text-xs font-medium text-brand-700 hover:underline"
                        >
                          Editar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center" role="presentation">
          <div
            className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900 dark:shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
          >
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
              {modal === 'create' ? 'Nuevo usuario' : 'Editar usuario'}
            </h2>
            <form className="mt-4 space-y-3" onSubmit={submit}>
              {modal === 'create' && (
                <label className="block text-sm">
                  <span className="va-label">Correo</span>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="va-field mt-1"
                  />
                </label>
              )}
              {modal === 'create' && (
                <label className="block text-sm">
                  <span className="va-label">Contraseña (mín. 8)</span>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="va-field mt-1"
                  />
                </label>
              )}
              {modal === 'edit' && (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  <span className="font-medium text-slate-700 dark:text-slate-200">{email}</span>
                </p>
              )}
              <label className="block text-sm">
                <span className="va-label">Nombre completo</span>
                <input
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="va-field mt-1"
                />
              </label>
              <fieldset className="text-sm">
                <legend className="va-label mb-2">Roles</legend>
                <div className="max-h-40 space-y-2 overflow-y-auto rounded-xl border border-slate-100 p-2 dark:border-slate-700 dark:bg-slate-800/40">
                  {roles.map((r) => (
                    <label key={r.id} className="flex items-center gap-2 text-slate-800 dark:text-slate-200">
                      <input
                        type="checkbox"
                        checked={roleIds.has(r.id)}
                        onChange={() => toggleRole(r.id)}
                        className="rounded border-slate-300 dark:border-slate-500"
                      />
                      <span>{r.name}</span>
                      <span className="text-xs text-slate-400 dark:text-slate-500">({r.slug})</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              {modal === 'edit' && can('users:deactivate') && (
                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="rounded border-slate-300 dark:border-slate-500"
                  />
                  <span>Usuario activo</span>
                </label>
              )}
              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white"
                >
                  Guardar
                </button>
                <button
                  type="button"
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  onClick={() => setModal(null)}
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
