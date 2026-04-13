import { useEffect, useState } from 'react'
import { api } from '../../api/client'
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

/** Si el API aún no devolvió la fila (bases anteriores), mostramos 70 sugerido y se persiste al primer guardado. */
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

export function SettingsPage() {
  const confirm = useConfirm()
  /** Respuesta cruda del API (sin defaults de UI). */
  const [serverSnapshot, setServerSnapshot] = useState<Record<string, unknown> | null>(null)
  const [map, setMap] = useState<Record<string, unknown> | null>(null)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState<string | null>(null)

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

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!map) return
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

  const keys = map ? Object.keys(map).sort() : []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">Configuración del taller</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Ajustes guardados en base. Cada ítem incluye una explicación breve; la clave técnica sirve para soporte y
          documentación.
        </p>
      </div>
      {msg && <p className="va-card-muted">{msg}</p>}
      {!map && <p className="text-slate-500 dark:text-slate-400">Cargando…</p>}
      {map && (
        <form onSubmit={save} className="va-card space-y-6">
          {keys.map((key) => {
            const { label, description } = getSettingPresentation(key)
            return (
              <div key={key} className="border-b border-slate-100 pb-5 last:border-0 last:pb-0 dark:border-slate-800">
                <label className="block">
                  <span className="text-base font-semibold text-slate-900 dark:text-slate-50">{label}</span>
                  <span className="mt-0.5 block font-mono text-[11px] text-slate-400 dark:text-slate-500">{key}</span>
                  <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">{description}</p>
                  {isUserCreatePolicyKey(key) ? (
                    <select
                      value={draft[key] === 'true' ? 'true' : 'false'}
                      onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                      className="va-field mt-2 max-w-md"
                    >
                      <option value="false">No</option>
                      <option value="true">Sí</option>
                    </select>
                  ) : (
                    <input
                      value={draft[key] ?? ''}
                      onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                      className="va-field mt-2 font-mono"
                    />
                  )}
                </label>
              </div>
            )
          })}
          <button type="submit" className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">
            Guardar cambios
          </button>
        </form>
      )}
    </div>
  )
}
