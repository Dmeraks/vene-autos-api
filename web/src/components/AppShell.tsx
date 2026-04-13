import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { ThemeToggle } from './ThemeToggle'

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  [
    'inline-flex min-h-[44px] shrink-0 snap-start items-center rounded-xl px-3 py-2.5 text-sm font-medium transition-colors md:min-h-0 md:py-2',
    isActive
      ? 'bg-brand-100 text-brand-900 shadow-sm ring-1 ring-brand-200/80 dark:bg-brand-900 dark:text-white dark:shadow-md dark:ring-1 dark:ring-brand-600/50'
      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/90 dark:hover:text-white',
  ].join(' ')

export function AppShell() {
  const { user, logout, can } = useAuth()

  const links = [
    { to: '/ordenes', label: 'Órdenes', show: can('work_orders:read') },
    { to: '/clientes', label: 'Clientes', show: can('customers:read') },
    { to: '/inventario', label: 'Repuestos', show: can('inventory_items:read') },
    { to: '/recepcion', label: 'Recepción', show: can('purchase_receipts:create') },
    { to: '/caja', label: 'Caja', show: can('cash_sessions:read') },
    { to: '/informes', label: 'Informes', show: can('reports:read') },
    { to: '/admin/usuarios', label: 'Usuarios', show: can('users:read') },
    { to: '/admin/roles', label: 'Roles', show: can('roles:read') },
    { to: '/admin/configuracion', label: 'Configuración', show: can('settings:read') },
    { to: '/admin/auditoria', label: 'Auditoría', show: can('audit:read') },
  ].filter((l) => l.show)

  return (
    <div className="flex min-h-dvh flex-col bg-slate-50 dark:bg-slate-950">
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/90">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-3 py-3 sm:gap-3 sm:px-4">
          <NavLink
            to="/"
            className="min-w-0 shrink font-semibold tracking-tight text-brand-900 dark:text-brand-100"
            end
          >
            Vene Autos
          </NavLink>
          {user && (
            <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
              <ThemeToggle />
              <span className="hidden max-w-[9rem] truncate text-sm text-slate-500 sm:inline md:max-w-[14rem] dark:text-slate-400">
                {user.fullName}
              </span>
              <button
                type="button"
                onClick={() => void logout()}
                className="rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 sm:px-3 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                Salir
              </button>
            </div>
          )}
        </div>
        {links.length > 0 && (
          <nav className="border-t border-slate-100 bg-slate-50/90 dark:border-slate-800 dark:bg-slate-950/95 dark:shadow-[inset_0_1px_0_0_rgba(148,163,184,0.08)]">
            <div className="mx-auto max-w-6xl px-2 py-2 md:px-4">
              <p className="mb-1.5 hidden text-[11px] font-medium uppercase tracking-wide text-slate-400 md:block dark:text-slate-500">
                Menú
              </p>
              <div
                className="-mx-1 flex gap-1 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] md:flex-wrap md:overflow-visible [&::-webkit-scrollbar]:hidden"
                aria-label="Navegación principal"
              >
                {links.map((l) => (
                  <NavLink key={l.to} to={l.to} className={navLinkClass}>
                    {l.label}
                  </NavLink>
                ))}
              </div>
            </div>
          </nav>
        )}
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-3 py-4 sm:px-4 sm:py-6">
        <Outlet />
      </main>

      <footer className="mt-auto border-t border-slate-200/80 px-3 py-4 text-center text-xs text-slate-400 dark:border-slate-800 dark:text-slate-500">
        Vene Autos — panel del taller
      </footer>
    </div>
  )
}
