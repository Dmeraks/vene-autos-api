import { Moon, Sun } from 'lucide-react'
import { useTheme } from '../theme/ThemeContext'

type ThemeToggleProps = {
  /** Etiquetas legibles sobre fondo oscuro (p. ej. carril de acceso en login). */
  labelsOnDark?: boolean
  /** Solo icono (barra superior estilo SaaS). */
  variant?: 'full' | 'icon'
}

/** Interruptor claro / oscuro (sin opción “sistema”). */
export function ThemeToggle({ labelsOnDark = false, variant = 'full' }: ThemeToggleProps) {
  const { preference, setPreference } = useTheme()
  const isDark = preference === 'dark'

  const labelMuted = labelsOnDark ? 'text-zinc-400' : 'text-slate-500 dark:text-slate-300'
  const labelStrong = labelsOnDark ? 'text-zinc-200' : 'text-slate-800 dark:text-slate-100'

  if (variant === 'icon') {
    return (
      <button
        type="button"
        title={isDark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
        aria-label={isDark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
        onClick={() => setPreference(isDark ? 'light' : 'dark')}
        className="rounded-lg border border-slate-200/90 bg-white p-2 text-slate-500 transition hover:bg-slate-50 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/35 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-100 dark:focus-visible:ring-offset-slate-900"
      >
        {isDark ? <Sun className="size-[1.125rem]" strokeWidth={1.75} aria-hidden /> : <Moon className="size-[1.125rem]" strokeWidth={1.75} aria-hidden />}
      </button>
    )
  }

  return (
    <div className="flex items-center gap-1.5" title="Tema de la interfaz">
      <span
        className={`hidden text-[11px] font-medium sm:inline ${!isDark ? labelStrong : labelMuted}`}
      >
        Claro
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={isDark}
        aria-label={isDark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
        onClick={() => setPreference(isDark ? 'light' : 'dark')}
        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900 ${
          isDark
            ? 'border-slate-500 bg-slate-600'
            : 'border-slate-300 bg-slate-200 dark:border-slate-500 dark:bg-slate-700'
        }`}
      >
        <span
          aria-hidden
          className={`pointer-events-none absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform dark:bg-slate-100 ${
            isDark ? 'translate-x-[1.25rem]' : 'translate-x-0'
          }`}
        />
      </button>
      <span className={`hidden text-[11px] font-medium sm:inline ${isDark ? labelStrong : labelMuted}`}>
        Oscuro
      </span>
    </div>
  )
}
