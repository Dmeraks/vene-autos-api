/** Mismo patrón que `MONEY_DECIMAL_REGEX` en el API: solo pesos enteros (sin decimales). */
export const API_MONEY_DECIMAL_REGEX = /^\d+$/

/**
 * Interpreta entrada local o estilo API a un número de pesos (puede ser fraccionario antes del techo).
 *
 * Miles en español (CO): puntos como separador (`1.000`, `25.000`, `2.550.356`).
 * No usar `Number("2.550")` antes de eso: en JS eso es 2.55, no 2550.
 */
function parseMoneyInputToPesoNumber(raw: string): number | null {
  const s = raw.trim().replace(/\s/g, '')
  if (!s) return null

  if (/^\d+$/.test(s)) {
    const n = Number(s)
    return Number.isFinite(n) ? n : null
  }

  if (s.includes(',')) {
    const noDots = s.replace(/\./g, '')
    const comma = noDots.indexOf(',')
    if (comma === -1) {
      const digits = s.replace(/\D/g, '')
      return digits ? Number(digits) : null
    }
    const intPart = noDots.slice(0, comma).replace(/\D/g, '')
    const decPart = noDots.slice(comma + 1).replace(/\D/g, '')
    if (!intPart && !decPart) return null
    const frac = decPart ? Number(`0.${decPart}`) : 0
    if (!Number.isFinite(frac)) return Number(intPart || '0')
    const base = Number(intPart || '0')
    if (!Number.isFinite(base)) return null
    return base + frac
  }

  const parts = s.split('.').filter((p) => p.length > 0)
  if (parts.length === 0) return null
  if (parts.length === 1) {
    const d = parts[0]!.replace(/\D/g, '')
    return d ? Number(d) : null
  }

  // Miles es-CO: trozos de 1–3 dígitos. El último de 3 ⇒ miles; 3+ trozos ⇒ siempre miles.
  if (parts.every((p) => /^\d{1,3}$/.test(p))) {
    if (parts.length >= 3) {
      return Number(parts.join(''))
    }
    if (parts.length === 2) {
      const last = parts[1]!
      if (last.length === 3) {
        return Number(parts.join(''))
      }
      return Number(`${parts[0]}.${last}`)
    }
  }

  const last = parts[parts.length - 1]!
  if (/^\d{1,2}$/.test(last)) {
    const head = parts.slice(0, -1).join('')
    if (/^\d+$/.test(head) && /^\d+$/.test(last)) {
      return Number(`${head}.${last}`)
    }
  }
  const digits = s.replace(/\D/g, '')
  return digits ? Number(digits) : null
}

/**
 * Convierte montos escritos o pegados en estilo local (miles con `.`, coma como decimal temporal)
 * al string entero en pesos COP que espera el API (techo si hubo fracción de peso).
 */
export function normalizeMoneyDecimalStringForApi(raw: string): string {
  const n = parseMoneyInputToPesoNumber(raw)
  if (n === null) return ''
  if (!Number.isFinite(n)) return ''
  if (!raw.replace(/\D/g, '').length) return ''
  const c = Math.ceil(n - 1e-9)
  return c < 0 ? '0' : String(c)
}

/** COP sin centavos en pantalla (agrupación es-CO). */
export function formatCopInteger(n: number): string {
  if (!Number.isFinite(n)) return '—'
  return Math.ceil(n - 1e-9).toLocaleString('es-CO', { maximumFractionDigits: 0 })
}

/**
 * Presentación para **inputs** de dinero (es-CO): miles con `.`, solo pesos enteros.
 * `norm` es el string “API” (solo dígitos), p. ej. `2550356`.
 */
export function formatMoneyInputDisplayFromNormalized(norm: string): string {
  const t = norm.trim()
  if (!t) return ''
  const n = Number(t)
  if (!Number.isFinite(n)) {
    const digits = t.replace(/\D/g, '')
    if (!digits) return ''
    const intNum = Math.ceil(Number(digits) - 1e-9)
    return intNum.toLocaleString('es-CO', { maximumFractionDigits: 0 })
  }
  const intNum = Math.ceil(n - 1e-9)
  return intNum.toLocaleString('es-CO', { maximumFractionDigits: 0 })
}

/** Monto desde string API (Decimal); si no parsea, devuelve el literal. */
export function formatCopFromString(s: string): string {
  const n = Number(s)
  if (Number.isNaN(n)) return s
  return formatCopInteger(n)
}
