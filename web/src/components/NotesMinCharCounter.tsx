/**
 * Contador alineado con la política del taller: longitud tras `trim`, igual que `assertOperationalNote` y el API.
 */
type Applicability = 'always' | 'withGap'

type Props = {
  value: string
  minLength: number
  /** Si false, cuenta caracteres sin trim (casos raros). Por defecto igual que validación. */
  trim?: boolean
  /**
   * `always`: el mínimo aplica siempre (notas obligatorias).
   * `withGap`: si está vacío, solo texto guía (p. ej. nota de cierre solo obligatoria con diferencia de arqueo).
   */
  applicability?: Applicability
  /** Con `withGap` y valor vacío; por defecto mensaje para cierre de caja. */
  gapEmptyHint?: string
  className?: string
}

export function NotesMinCharCounter({
  value,
  minLength,
  trim = true,
  applicability = 'always',
  gapEmptyHint,
  className = '',
}: Props) {
  const len = trim ? value.trim().length : value.length
  const meets = len >= minLength

  if (applicability === 'withGap' && len === 0) {
    return (
      <p
        className={`mt-1 text-xs leading-snug text-slate-500 dark:text-slate-400 ${className}`.trim()}
        aria-live="polite"
      >
        {gapEmptyHint ??
          `Si el arqueo no coincide con lo esperado, esta nota será obligatoria (mín. ${minLength} caracteres).`}
      </p>
    )
  }

  const gapSuffix =
    applicability === 'withGap'
      ? ' · el mínimo es obligatorio solo si el arqueo no coincide con lo esperado'
      : ''

  return (
    <p
      className={`mt-1 text-xs tabular-nums leading-snug ${meets ? 'text-slate-600 dark:text-slate-400' : 'text-amber-800 dark:text-amber-200'} ${className}`.trim()}
      aria-live="polite"
    >
      <span className="font-semibold">{len}</span> / {minLength} caracteres{gapSuffix}
      {!meets && applicability === 'always' && (
        <span className="font-normal"> · faltan {minLength - len}</span>
      )}
      {!meets && applicability === 'withGap' && len > 0 && (
        <span className="font-normal"> · faltan {minLength - len} para el mínimo</span>
      )}
    </p>
  )
}
