/** Clave en el mapa completo `GET /settings` (solo quien tenga `settings:read`). */
export const NOTES_MIN_LENGTH_SETTING_KEY = 'notes.min_length_chars'

/** Respuesta de `GET /settings/ui-context` (cualquier usuario autenticado). Ver `api/docs/NOTAS_POLITICA.md`. */
export const SETTINGS_UI_CONTEXT_PATH = '/settings/ui-context'

const FALLBACK_GENERAL = 50
const FALLBACK_WORK_ORDER_PAYMENT = 70

export type SettingsNotesUiContext = {
  notesMinLengthChars: number
  notesMinLengthWorkOrderPayment: number
}

/** Respuesta JSON de `GET /settings/ui-context` (antes de validar tipos). */
export type SettingsUiContextResponse = Record<string, unknown>

function clampNotesMin(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? parseInt(value, 10) : NaN
  if (!Number.isFinite(n) || n < 5) return fallback
  return Math.min(500, Math.floor(n))
}

/** @deprecated Usar `parseNotesUiContext` y `.general`. */
export function parseNotesMinLength(value: unknown): number {
  return clampNotesMin(value, FALLBACK_GENERAL)
}

/** Mínimos efectivos para formularios (general vs cobros en OT). */
export function parseNotesUiContext(raw: SettingsUiContextResponse): SettingsNotesUiContext {
  return {
    notesMinLengthChars: clampNotesMin(raw.notesMinLengthChars, FALLBACK_GENERAL),
    notesMinLengthWorkOrderPayment: clampNotesMin(
      raw.notesMinLengthWorkOrderPayment,
      FALLBACK_WORK_ORDER_PAYMENT,
    ),
  }
}

export function notesMinHint(min: number): string {
  return `Obligatoria: al menos ${min} caracteres (configuración del taller).`
}
