import { useId, useState } from 'react'
import type { ThemePreference } from '../theme/ThemeContext'
import { useTheme } from '../theme/ThemeContext'

const OPTIONS: { value: ThemePreference; label: string; hint: string }[] = [
  { value: 'system', label: 'Sistema', hint: 'Igual que en el dispositivo' },
  { value: 'light', label: 'Claro', hint: 'Fondo claro, texto oscuro' },
  { value: 'dark', label: 'Oscuro', hint: 'Fondo oscuro, texto claro' },
]

export function ThemeToggle() {
  const { preference, setPreference } = useTheme()
  const [open, setOpen] = useState(false)
  const rootId = useId()

  const current = OPTIONS.find((o) => o.value === preference) ?? OPTIONS[0]

  return (
    <div className="relative">
      <button
        type="button"
        id={`${rootId}-theme-btn`}
        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={`${rootId}-theme-list`}
        onClick={() => setOpen((o) => !o)}
        title="Tema de la interfaz"
      >
        <span aria-hidden>◐</span>
        <span className="hidden sm:inline">{current.label}</span>
      </button>
      {open && (
        <>
          <ul
            id={`${rootId}-theme-list`}
            role="listbox"
            aria-labelledby={`${rootId}-theme-btn`}
            className="absolute right-0 z-50 mt-1 w-52 rounded-xl border border-slate-200 bg-white py-1 shadow-lg ring-1 ring-black/5 dark:border-slate-700 dark:bg-slate-900 dark:shadow-xl dark:ring-slate-600/60"
          >
            {OPTIONS.map((o) => (
              <li key={o.value} role="option" aria-selected={preference === o.value}>
                <button
                  type="button"
                  className={`w-full px-3 py-2 text-left text-sm transition hover:bg-slate-50 dark:hover:bg-slate-700/80 ${
                    preference === o.value
                      ? 'bg-brand-50 font-medium text-brand-900 dark:bg-brand-900 dark:text-white'
                      : 'text-slate-800 dark:text-slate-100'
                  }`}
                  onClick={() => {
                    setPreference(o.value)
                    setOpen(false)
                  }}
                >
                  <span className="block">{o.label}</span>
                  <span className="mt-0.5 block text-xs font-normal text-slate-500 dark:text-slate-400">
                    {o.hint}
                  </span>
                </button>
              </li>
            ))}
            <li className="border-t border-slate-100 dark:border-slate-700">
              <button
                type="button"
                className="w-full px-3 py-2 text-center text-sm font-medium text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800/80"
                onClick={() => setOpen(false)}
              >
                Cancelar
              </button>
            </li>
          </ul>
        </>
      )}
    </div>
  )
}
