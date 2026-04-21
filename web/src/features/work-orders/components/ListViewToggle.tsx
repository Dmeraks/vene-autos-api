import { memo } from 'react'
import type { WoListView } from '../services/workOrdersListPresentation'

export const ListViewToggle = memo(function ListViewToggle({
  value,
  onChange,
}: {
  value: WoListView
  onChange: (v: WoListView) => void
}) {
  const modes: { id: WoListView; label: string; title: string }[] = [
    { id: 'grid', label: 'Cuadrícula', title: 'Vista en cuadrícula' },
    { id: 'list', label: 'Lista', title: 'Vista compacta en lista' },
    { id: 'details', label: 'Detalles', title: 'Vista con más datos por orden' },
  ]

  return (
    <div
      className="flex shrink-0 flex-col gap-1 sm:items-end"
      role="radiogroup"
      aria-label="Vista del listado de órdenes"
    >
      <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-300">
        Vista
      </span>
      <div className="va-tabstrip va-tabstrip--inline va-tabstrip--compact" role="presentation">
        {modes.map((m) => {
          const on = value === m.id
          return (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={on}
              title={m.title}
              onClick={() => onChange(m.id)}
              className={`va-tab inline-flex min-w-[2.75rem] items-center justify-center sm:px-3 ${
                on ? 'va-tab-active' : 'va-tab-inactive'
              }`}
            >
              <span className="sr-only">{m.title}</span>
              <span aria-hidden className="hidden sm:inline">
                {m.label}
              </span>
              {m.id === 'grid' && (
                <svg
                  className="h-4 w-4 sm:ml-1 sm:hidden"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden
                >
                  <rect x="3" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" />
                  <rect x="14" y="14" width="7" height="7" rx="1" />
                </svg>
              )}
              {m.id === 'list' && (
                <svg
                  className="h-4 w-4 sm:ml-1 sm:hidden"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden
                >
                  <path d="M4 6h16M4 12h16M4 18h10" />
                </svg>
              )}
              {m.id === 'details' && (
                <svg
                  className="h-4 w-4 sm:ml-1 sm:hidden"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden
                >
                  <rect x="4" y="3" width="16" height="18" rx="2" />
                  <path d="M8 8h8M8 12h8M8 16h5" />
                </svg>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
})
