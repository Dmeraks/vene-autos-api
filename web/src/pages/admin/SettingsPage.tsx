import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../../api/client'
import { useAuth } from '../../auth/AuthContext'
import { useConfirm } from '../../components/confirm/ConfirmProvider'
import { getSettingPresentation } from '../../config/settingsPresentation'

function displayValue(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

function isUserCreatePolicyKey(key: string) {
  return key === 'users.create_requires_dueno_role' || key === 'users.create_requires_owner_role'
}

const WORK_ORDER_PAYMENT_NOTE_KEY = 'notes.min_length.work_order_payment'

const DEFAULT_WORK_ORDER_PAYMENT_MIN = 70

function mergeSettingsFromServer(m: Record<string, unknown>): Record<string, unknown> {
  const out = { ...m }
  if (!(WORK_ORDER_PAYMENT_NOTE_KEY in out)) out[WORK_ORDER_PAYMENT_NOTE_KEY] = DEFAULT_WORK_ORDER_PAYMENT_MIN
  return out
}

function parseValue(key: string, raw: string): unknown {
  const t = raw.trim()
  if (key === 'auth.session_idle_timeout_minutes') return parseInt(t, 10)
  if (key === 'notes.min_length_chars' || key === WORK_ORDER_PAYMENT_NOTE_KEY) return parseInt(t, 10)
  if (isUserCreatePolicyKey(key)) {
    return t === 'true' || t === '1' || t === 'sí'
  }
  try {
    return JSON.parse(t)
  } catch {
    return t
  }
}

type UserOption = { id: string; email: string; fullName: string; isActive: boolean }

const SETTING_SECTIONS: Array<{
  id: string
  title: string
  description: string
  match: (key: string) => boolean
}> = [
  {
    id: 'auth',
    title: 'Sesión y seguridad',
    description: 'Tiempo de inactividad y políticas de acceso al panel.',
    match: (key) => key.startsWith('auth.'),
  },
  {
    id: 'workshop',
    title: 'Identidad del taller',
    description: 'Nombre, moneda y zona horaria usados en el sistema.',
    match: (key) => key.startsWith('workshop.'),
  },
  {
    id: 'notes',
    title: 'Notas operativas',
    description: 'Longitud mínima de textos en caja, cobros y recepción.',
    match: (key) => key.startsWith('notes.'),
  },
  {
    id: 'users',
    title: 'Política de usuarios',
    description: 'Quién puede dar de alta cuentas nuevas.',
    match: (key) => isUserCreatePolicyKey(key),
  },
  {
    id: 'other',
    title: 'Otros parámetros',
    description: 'Claves adicionales guardadas en base (avanzado).',
    match: () => true,
  },
]

function groupSettingKeys(keys: string[]): Array<{ section: (typeof SETTING_SECTIONS)[number]; keys: string[] }> {
  const used = new Set<string>()
  const out: Array<{ section: (typeof SETTING_SECTIONS)[number]; keys: string[] }> = []
  for (const section of SETTING_SECTIONS) {
    if (section.id === 'other') continue
    const group = keys.filter((k) => !used.has(k) && section.match(k))
    for (const k of group) used.add(k)
    if (group.length) out.push({ section, keys: group.sort() })
  }
  const rest = keys.filter((k) => !used.has(k)).sort()
  if (rest.length) {
    const other = SETTING_SECTIONS.find((s) => s.id === 'other')!
    out.push({ section: other, keys: rest })
  }
  return out
}

export function SettingsPage() {
  const { can } = useAuth()
  const confirm = useConfirm()
  const canSaveSettings = can('settings:update')
  const canResetPasswords = can('users:reset_password')

  const [panel, setPanel] = useState<'workshop' | 'support'>('workshop')

  const [serverSnapshot, setServerSnapshot] = useState<Record<string, unknown> | null>(null)
  const [map, setMap] = useState<Record<string, unknown> | null>(null)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState<string | null>(null)

  const [userOptions, setUserOptions] = useState<UserOption[] | null>(null)
  const [resetUserId, setResetUserId] = useState('')
  const [resetPw1, setResetPw1] = useState('')
  const [resetPw2, setResetPw2] = useState('')
  const [resetMsg, setResetMsg] = useState<string | null>(null)
  const [resetBusy, setResetBusy] = useState(false)

  useEffect(() => {
    void api<Record<string, unknown>>('/settings')
      .then((raw) => {
        setServerSnapshot(raw)
        const merged = mergeSettingsFromServer(raw)
        setMap(merged)
        const d: Record<string, string> = {}
        for (const k of Object.keys(merged)) {
          d[k] = displayValue(merged[k])
        }
        setDraft(d)
      })
      .catch(() => setMsg('No se pudo cargar la configuración'))
  }, [])

  useEffect(() => {
    if (!canResetPasswords) return
    void api<UserOption[]>('/users')
      .then((rows) => {
        setUserOptions(rows.map((r) => ({ id: r.id, email: r.email, fullName: r.fullName, isActive: r.isActive })))
      })
      .catch(() => setUserOptions([]))
  }, [canResetPasswords])

  const keys = map ? Object.keys(map).sort() : []
  const groupedKeys = useMemo(() => groupSettingKeys(keys), [keys])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!map || !canSaveSettings) return
    setMsg(null)
    const values: Record<string, unknown> = {}
    for (const key of Object.keys(map)) {
      const next = parseValue(key, draft[key] ?? '')
      const prev = map[key]
      if (displayValue(next) !== displayValue(prev)) {
        values[key] = next
      }
    }
    if (
      serverSnapshot &&
      !(WORK_ORDER_PAYMENT_NOTE_KEY in serverSnapshot) &&
      WORK_ORDER_PAYMENT_NOTE_KEY in map
    ) {
      values[WORK_ORDER_PAYMENT_NOTE_KEY] = parseValue(
        WORK_ORDER_PAYMENT_NOTE_KEY,
        draft[WORK_ORDER_PAYMENT_NOTE_KEY] ?? '',
      )
    }
    if (Object.keys(values).length === 0) {
      setMsg('Sin cambios')
      return
    }
    const diffLines = Object.keys(values).map((k) => {
      const hadOnServer = serverSnapshot && k in serverSnapshot
      const prev = hadOnServer ? displayValue(serverSnapshot[k]) : '(nuevo en base o valor sugerido)'
      const next = displayValue(values[k])
      const label = getSettingPresentation(k).label
      return `· ${label}\n  (${k})\n  ${prev} → ${next}`
    })
    const ok = await confirm({
      title: 'Guardar configuración del taller',
      message: `¿Guardar estos cambios?\n\n${diffLines.join('\n\n')}\n\nAfecta políticas globales (sesiones, permisos, etc.). Revisá cada valor antes de confirmar.`,
      confirmLabel: 'Guardar',
    })
    if (!ok) return
    try {
      const updated = await api<Record<string, unknown>>('/settings', {
        method: 'PATCH',
        body: JSON.stringify({ values }),
      })
      setServerSnapshot(updated)
      const merged = mergeSettingsFromServer(updated)
      setMap(merged)
      const d: Record<string, string> = {}
      for (const k of Object.keys(merged)) {
        d[k] = displayValue(merged[k])
      }
      setDraft(d)
      setMsg('Configuración guardada')
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Error al guardar')
    }
  }

  const submitResetPassword = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      setResetMsg(null)
      if (!resetUserId) {
        setResetMsg('Elegí un usuario')
        return
      }
      if (resetPw1.length < 8) {
        setResetMsg('La contraseña debe tener al menos 8 caracteres')
        return
      }
      if (resetPw1 !== resetPw2) {
        setResetMsg('Las contraseñas no coinciden')
        return
      }
      const u = userOptions?.find((x) => x.id === resetUserId)
      const ok = await confirm({
        title: 'Restablecer contraseña',
        message: `¿Asignar una contraseña nueva a esta cuenta?\n\n${u?.fullName ?? ''} (${u?.email ?? ''})\n\nSe cerrarán todas las sesiones abiertas de ese usuario. Comunicá la contraseña por un canal seguro.`,
        confirmLabel: 'Restablecer',
        variant: 'danger',
      })
      if (!ok) return
      setResetBusy(true)
      try {
        await api(`/users/${resetUserId}/password`, {
          method: 'PATCH',
          body: JSON.stringify({ password: resetPw1 }),
        })
        setResetPw1('')
        setResetPw2('')
        setResetMsg('Contraseña actualizada. El usuario debe iniciar sesión de nuevo.')
      } catch (err) {
        setResetMsg(err instanceof Error ? err.message : 'Error al restablecer')
      } finally {
        setResetBusy(false)
      }
    },
    [resetUserId, resetPw1, resetPw2, userOptions, confirm],
  )

  const showSupportTab = canResetPasswords

  return (
    <div className="space-y-8">
      <header className="border-b border-slate-200/80 pb-6 dark:border-slate-800">
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-700 dark:text-brand-300">
          Administración
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
          Configuración del taller
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-400">
          Parámetros globales del sistema y, si tu rol lo permite, herramientas de soporte para recuperar accesos. Los
          cambios quedan registrados en auditoría cuando aplica.
        </p>
      </header>

      {showSupportTab && (
        <div className="va-tabstrip max-w-xl" role="tablist" aria-label="Secciones de configuración">
          <button
            type="button"
            role="tab"
            aria-selected={panel === 'workshop'}
            className={`va-tab ${panel === 'workshop' ? 'va-tab-active' : 'va-tab-inactive'}`}
            onClick={() => setPanel('workshop')}
          >
            Parámetros del taller
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={panel === 'support'}
            className={`va-tab ${panel === 'support' ? 'va-tab-active' : 'va-tab-inactive'}`}
            onClick={() => setPanel('support')}
          >
            Soporte — contraseñas
          </button>
        </div>
      )}

      {msg && <p className="va-card-muted">{msg}</p>}

      {(!showSupportTab || panel === 'workshop') && (
        <>
          {!map && <p className="text-slate-500 dark:text-slate-400">Cargando…</p>}
          {map && (
            <form onSubmit={save} className="space-y-8">
              {!canSaveSettings && (
                <p className="rounded-xl border border-amber-200/80 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
                  Solo tenés permiso de lectura. Los valores se muestran para consulta; un usuario con permiso de
                  actualización puede modificarlos.
                </p>
              )}

              {groupedKeys.map(({ section, keys: sectionKeys }) => (
                <section
                  key={section.id}
                  className="va-card border-slate-200/90 shadow-sm dark:border-slate-700/90"
                >
                  <div className="border-b border-slate-100 pb-4 dark:border-slate-800">
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">{section.title}</h2>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{section.description}</p>
                  </div>
                  <div className="mt-5 space-y-6">
                    {sectionKeys.map((key) => {
                      const { label, description } = getSettingPresentation(key)
                      return (
                        <div
                          key={key}
                          className="rounded-xl border border-slate-100 bg-slate-50/40 p-4 dark:border-slate-800 dark:bg-slate-800/30"
                        >
                          <label className="block">
                            <span className="text-sm font-semibold text-slate-900 dark:text-slate-50">{label}</span>
                            <span className="mt-0.5 block font-mono text-[11px] text-slate-400 dark:text-slate-500">
                              {key}
                            </span>
                            <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                              {description}
                            </p>
                            {isUserCreatePolicyKey(key) ? (
                              <select
                                value={draft[key] === 'true' ? 'true' : 'false'}
                                disabled={!canSaveSettings}
                                onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                                className="va-field mt-3 max-w-md disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                <option value="false">No</option>
                                <option value="true">Sí</option>
                              </select>
                            ) : (
                              <input
                                value={draft[key] ?? ''}
                                disabled={!canSaveSettings}
                                onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                                className="va-field mt-3 font-mono disabled:cursor-not-allowed disabled:opacity-60"
                              />
                            )}
                          </label>
                        </div>
                      )
                    })}
                  </div>
                </section>
              ))}

              {canSaveSettings && (
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="submit"
                    className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700"
                  >
                    Guardar cambios
                  </button>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Antes de guardar se muestra un resumen para confirmar.
                  </p>
                </div>
              )}
            </form>
          )}
        </>
      )}

      {showSupportTab && panel === 'support' && (
        <section className="va-card border-brand-200/60 dark:border-brand-900/50">
          <div className="flex flex-col gap-2 border-b border-slate-100 pb-4 sm:flex-row sm:items-start sm:justify-between dark:border-slate-800">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Restablecer contraseña</h2>
              <p className="mt-1 max-w-xl text-sm text-slate-600 dark:text-slate-400">
                Uso restringido cuando un integrante pierde el acceso. No existe en el panel la opción de que cada
                usuario cambie su propia contraseña: solo quien tenga este permiso puede asignar una nueva.
              </p>
            </div>
            <span className="shrink-0 rounded-lg bg-brand-100 px-2.5 py-1 text-xs font-medium text-brand-900 dark:bg-brand-950/80 dark:text-brand-200">
              Permiso: users:reset_password
            </span>
          </div>

          {resetMsg && (
            <p
              className={`mt-4 rounded-xl border px-3 py-2 text-sm ${
                resetMsg.includes('Error') || resetMsg.includes('coinciden') || resetMsg.includes('Elegí')
                  ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-200'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-100'
              }`}
            >
              {resetMsg}
            </p>
          )}

          {!userOptions && <p className="mt-4 text-sm text-slate-500">Cargando usuarios…</p>}
          {userOptions && (
            <form className="mt-6 space-y-4" onSubmit={submitResetPassword}>
              <label className="block text-sm">
                <span className="va-label">Usuario</span>
                <select
                  value={resetUserId}
                  onChange={(e) => setResetUserId(e.target.value)}
                  className="va-field mt-1 max-w-lg"
                  required
                >
                  <option value="">— Elegir cuenta —</option>
                  {userOptions.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.fullName} ({u.email}){u.isActive ? '' : ' — inactivo'}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="va-label">Nueva contraseña (mín. 8)</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  value={resetPw1}
                  onChange={(e) => setResetPw1(e.target.value)}
                  className="va-field mt-1 max-w-lg"
                />
              </label>
              <label className="block text-sm">
                <span className="va-label">Repetir contraseña</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  value={resetPw2}
                  onChange={(e) => setResetPw2(e.target.value)}
                  className="va-field mt-1 max-w-lg"
                />
              </label>
              <button
                type="submit"
                disabled={resetBusy}
                className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
              >
                {resetBusy ? 'Aplicando…' : 'Restablecer contraseña'}
              </button>
            </form>
          )}
        </section>
      )}
    </div>
  )
}
