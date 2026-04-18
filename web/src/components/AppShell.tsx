import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  BarChart3,
  Bell,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  Droplet,
  FileText,
  HandCoins,
  Inbox,
  LayoutDashboard,
  LogOut,
  Package,
  Percent,
  Receipt,
  ScrollText,
  Search,
  Settings,
  Shield,
  Users,
  UsersRound,
  Wallet,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import type { LoginResponse } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { CashSessionOpenProvider, useCashSessionOpen } from '../context/CashSessionOpenContext'
import { usePanelTheme, useUiSettings } from '../theme/PanelThemeProvider'
import { setStoredLastModulePath } from '../utils/lastModule'
import { ThemeToggle } from './ThemeToggle'

type PreviewRoleRow = { id: string; name: string; slug: string; isSystem: boolean }

function activeNavTo(pathname: string, linkTos: readonly string[]): string | null {
  const matches = linkTos.filter((to) => pathname === to || pathname.startsWith(`${to}/`))
  if (matches.length === 0) return null
  return matches.reduce((a, b) => (a.length >= b.length ? a : b))
}

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function BrandDiamond({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <path
        d="M12 2.5l8.5 9.5L12 21.5l-8.5-9.5L12 2.5z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  )
}

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  [
    'relative z-10 inline-flex min-h-[44px] shrink-0 snap-start items-center rounded-xl px-3 py-2.5 text-sm font-medium uppercase tracking-wide transition-[color,transform] duration-300 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/35 focus-visible:ring-offset-2 focus-visible:ring-offset-white md:min-h-0 md:py-2 dark:focus-visible:ring-offset-slate-900',
    isActive
      ? 'text-brand-900 dark:text-white'
      : 'text-slate-700 hover:bg-slate-200/90 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800/80 dark:hover:text-white',
  ].join(' ')

/** Carril horizontal móvil (tema SaaS): tipografía estilo referencia, con icono. */
const navLinkHorizontalSaasClass = ({ isActive }: { isActive: boolean }) =>
  [
    'relative z-10 inline-flex min-h-[44px] shrink-0 snap-start items-center gap-2 rounded-lg px-3 py-2.5 text-[13px] font-medium tracking-normal transition-[color,transform] duration-200 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/35 focus-visible:ring-offset-2 focus-visible:ring-offset-white md:min-h-0 md:py-2 dark:focus-visible:ring-offset-slate-900',
    isActive
      ? 'text-brand-800 dark:text-white [&_svg]:opacity-100'
      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/80 dark:hover:text-white [&_svg]:opacity-[0.88]',
  ].join(' ')

/** Sidebar escritorio (tema SaaS): icono + texto, estilo Rhombus. */
const navLinkSidebarSaasClass = ({ isActive }: { isActive: boolean }) =>
  [
    'relative z-10 flex min-h-[44px] w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium tracking-normal transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30 md:min-h-0',
    isActive
      ? 'text-brand-800 dark:text-white [&_svg]:opacity-100'
      : 'text-slate-600 hover:bg-white/90 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-900/60 dark:hover:text-white [&_svg]:opacity-[0.88]',
  ].join(' ')

type NavLinkItem = {
  to: string
  label: string
  show: boolean
  Icon: LucideIcon
}

type TaskMode = {
  id: 'cash' | 'orders' | 'inventory' | 'customers' | 'admin'
  label: string
  routePrefixes: string[]
  relatedRoutes: string[]
}

const TASK_MODES: TaskMode[] = [
  {
    id: 'cash',
    label: 'Modo Caja',
    routePrefixes: ['/caja', '/ventas'],
    relatedRoutes: ['/caja', '/ordenes', '/ventas'],
  },
  {
    id: 'orders',
    label: 'Modo Órdenes',
    routePrefixes: ['/ordenes'],
    relatedRoutes: ['/ordenes', '/clientes', '/caja'],
  },
  {
    id: 'inventory',
    label: 'Modo Inventario',
    routePrefixes: ['/inventario', '/recepcion', '/aceite'],
    relatedRoutes: ['/inventario', '/recepcion', '/aceite', '/ordenes'],
  },
  {
    id: 'customers',
    label: 'Modo Clientes',
    routePrefixes: ['/clientes', '/vehiculos'],
    relatedRoutes: ['/clientes', '/ordenes'],
  },
  {
    id: 'admin',
    label: 'Modo Administración',
    routePrefixes: ['/admin'],
    relatedRoutes: [
      '/admin/usuarios',
      '/admin/roles',
      '/admin/servicios',
      '/admin/impuestos',
      '/admin/nomina',
      '/admin/auditoria',
      '/admin/configuracion',
    ],
  },
]

function resolveTaskMode(pathname: string): TaskMode | null {
  return (
    TASK_MODES.find((mode) =>
      mode.routePrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)),
    ) ?? null
  )
}

function saasIconButtonClass() {
  return 'rounded-lg border border-slate-200/90 bg-white p-2 text-slate-500 transition hover:bg-slate-50 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/35 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-100 dark:focus-visible:ring-offset-slate-900'
}

const SAAS_SIDEBAR_COLLAPSED_KEY = 'vene.panel.sidebarCollapsed'

function readSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(SAAS_SIDEBAR_COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

function writeSidebarCollapsed(collapsed: boolean) {
  try {
    localStorage.setItem(SAAS_SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0')
  } catch {
    /* ignore */
  }
}

function AppShellInner() {
  const panelTheme = usePanelTheme()
  const { electronicInvoiceEnabled } = useUiSettings()
  const isSaas = panelTheme === 'saas_light'
  const shellMaxClass = isSaas
    ? 'max-w-[min(88rem,calc(100vw-1rem))] 2xl:max-w-[min(96rem,calc(100vw-1.5rem))]'
    : 'max-w-6xl'

  const { user, logout, can, applyAuthResponse } = useAuth()
  const { open: cashSessionOpen } = useCashSessionOpen()
  const location = useLocation()
  const navigate = useNavigate()
  const taskMode = useMemo(() => resolveTaskMode(location.pathname), [location.pathname])
  const [panelSearch, setPanelSearch] = useState('')
  const [saasSidebarCollapsed, setSaasSidebarCollapsed] = useState(readSidebarCollapsed)

  const toggleSaasSidebar = useCallback(() => {
    setSaasSidebarCollapsed((c) => {
      const next = !c
      writeSidebarCollapsed(next)
      return next
    })
  }, [])

  useEffect(() => {
    if (location.pathname !== '/ordenes') return
    const sp = new URLSearchParams(location.search)
    setPanelSearch(sp.get('search') ?? '')
  }, [location.pathname, location.search])

  const submitPanelSearch = useCallback(
    (e?: FormEvent) => {
      e?.preventDefault()
      const raw = panelSearch.trim()
      if (location.pathname === '/ordenes') {
        const next = new URLSearchParams(location.search)
        if (raw) next.set('search', raw)
        else next.delete('search')
        next.delete('page')
        const qs = next.toString()
        navigate({ pathname: '/ordenes', search: qs ? `?${qs}` : '' }, { replace: true })
      } else {
        navigate(raw ? `/ordenes?search=${encodeURIComponent(raw)}` : '/ordenes')
      }
    },
    [location.pathname, location.search, navigate, panelSearch],
  )
  const [previewRoles, setPreviewRoles] = useState<PreviewRoleRow[]>([])
  const [rolePreviewBusy, setRolePreviewBusy] = useState(false)
  const navOuterRef = useRef<HTMLDivElement>(null)
  const navRowRef = useRef<HTMLDivElement>(null)
  const linkRefs = useRef<Map<string, HTMLAnchorElement>>(new Map())
  const [pill, setPill] = useState({ left: 0, top: 0, width: 0, height: 0, visible: false })

  const loadPreviewRoleCandidates = useCallback(async () => {
    if (!can('auth:assume_role_preview')) {
      setPreviewRoles([])
      return
    }
    try {
      const list = await api<PreviewRoleRow[]>('/auth/preview-role/candidates')
      setPreviewRoles(Array.isArray(list) ? list : [])
    } catch {
      setPreviewRoles([])
    }
  }, [can])

  useEffect(() => {
    void loadPreviewRoleCandidates()
  }, [loadPreviewRoleCandidates])

  useEffect(() => {
    setStoredLastModulePath(location.pathname)
  }, [location.pathname])

  const previewSelectValue = user?.previewRole?.id ?? ''

  const roleOptions = useMemo((): PreviewRoleRow[] => {
    const list = [...previewRoles]
    const pr = user?.previewRole
    if (pr && !list.some((r) => r.id === pr.id)) {
      list.unshift({ id: pr.id, name: pr.name, slug: pr.slug, isSystem: true })
    }
    return list
  }, [previewRoles, user?.previewRole])

  async function onPreviewRoleChange(roleId: string) {
    if (!can('auth:assume_role_preview') || rolePreviewBusy) return
    const current = user?.previewRole?.id ?? ''
    if (roleId === current) return
    setRolePreviewBusy(true)
    try {
      if (roleId === '') {
        const res = await api<LoginResponse>('/auth/preview-role/clear', { method: 'POST' })
        applyAuthResponse(res)
      } else {
        const res = await api<LoginResponse>('/auth/preview-role', {
          method: 'POST',
          body: JSON.stringify({ roleId }),
        })
        applyAuthResponse(res)
      }
    } catch {
      /* sin toast global; el usuario puede reintentar */
    } finally {
      setRolePreviewBusy(false)
    }
  }

  const links = useMemo((): NavLinkItem[] => {
    const recepcionVisible = can('purchase_receipts:create') && cashSessionOpen === true
    const all: NavLinkItem[] = [
      { to: '/', label: 'Inicio', Icon: LayoutDashboard, show: true },
      { to: '/caja', label: 'Caja', Icon: Wallet, show: can('cash_sessions:read') },
      { to: '/ordenes', label: 'Órdenes', Icon: ClipboardList, show: can('work_orders:read') || can('work_orders:read_portal') },
      { to: '/ventas', label: 'Ventas', Icon: Receipt, show: can('sales:read') },
      {
        to: '/facturacion',
        label: 'Facturación',
        Icon: FileText,
        // Fase 7.5: facturación electrónica desactivada por defecto mientras el taller opere
        // como persona natural. Se emite sólo cuando se activa el switch + hay resolución DIAN.
        show: can('invoices:read') && electronicInvoiceEnabled,
      },
      { to: '/clientes', label: 'Clientes', Icon: Users, show: can('customers:read') },
      { to: '/recepcion', label: 'Recepción', Icon: Inbox, show: recepcionVisible },
      { to: '/inventario', label: 'Repuestos', Icon: Package, show: can('inventory_items:read') },
      { to: '/aceite', label: 'Aceite', Icon: Droplet, show: can('inventory_items:read') },
      { to: '/admin/usuarios', label: 'Usuarios', Icon: UsersRound, show: can('users:read') },
      { to: '/admin/nomina', label: 'Nómina', Icon: HandCoins, show: can('payroll:read') },
      { to: '/informes', label: 'Informes', Icon: BarChart3, show: can('reports:read') },
      { to: '/admin/servicios', label: 'Servicios', Icon: Wrench, show: can('services:read') },
      { to: '/admin/impuestos', label: 'Impuestos', Icon: Percent, show: can('tax_rates:read') },
      { to: '/admin/roles', label: 'Roles', Icon: Shield, show: can('roles:read') },
      { to: '/admin/auditoria', label: 'Auditoría', Icon: ScrollText, show: can('audit:read') },
      { to: '/admin/configuracion', label: 'Configuración', Icon: Settings, show: can('settings:read') },
    ]
    return all.filter((l) => l.show)
  }, [can, cashSessionOpen, electronicInvoiceEnabled])

  const linkTos = useMemo(() => links.map((l) => l.to), [links])
  const relatedTaskLinks = useMemo(() => {
    if (!taskMode) return []
    return taskMode.relatedRoutes.map((to) => links.find((l) => l.to === to)).filter(Boolean) as NavLinkItem[]
  }, [links, taskMode])

  const horizontalLinkClass = isSaas ? navLinkHorizontalSaasClass : navLinkClass

  const syncPill = useCallback(() => {
    if (isSaas && typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches) {
      setPill((p) => ({ ...p, visible: false }))
      return
    }
    const outer = navOuterRef.current
    const row = navRowRef.current
    if (!outer || !row) return
    const activeTo = activeNavTo(location.pathname, linkTos)
    if (!activeTo) {
      setPill((p) => ({ ...p, visible: false }))
      return
    }
    const el = linkRefs.current.get(activeTo)
    if (!el) {
      setPill((p) => ({ ...p, visible: false }))
      return
    }
    const oRect = outer.getBoundingClientRect()
    const eRect = el.getBoundingClientRect()
    const lineTopPx = el.offsetTop
    let lineHeightPx = el.offsetHeight
    let allSameLine = true
    for (const link of linkRefs.current.values()) {
      if (link.offsetTop !== lineTopPx) allSameLine = false
      if (link.offsetTop === lineTopPx) {
        lineHeightPx = Math.max(lineHeightPx, link.offsetTop + link.offsetHeight - lineTopPx)
      }
    }
    const fullStrip = allSameLine && linkRefs.current.size > 0
    setPill({
      left: eRect.left - oRect.left,
      top: fullStrip ? 0 : row.offsetTop + lineTopPx,
      width: eRect.width,
      height: fullStrip ? outer.offsetHeight : lineHeightPx,
      visible: true,
    })
  }, [location.pathname, linkTos, isSaas])

  useLayoutEffect(() => {
    syncPill()
  }, [syncPill])

  useEffect(() => {
    const outer = navOuterRef.current
    const row = navRowRef.current
    if (!outer || !row) return
    const ro = new ResizeObserver(() => syncPill())
    ro.observe(outer)
    ro.observe(row)
    row.addEventListener('scroll', syncPill, { passive: true })
    window.addEventListener('resize', syncPill)
    return () => {
      ro.disconnect()
      row.removeEventListener('scroll', syncPill)
      window.removeEventListener('resize', syncPill)
    }
  }, [syncPill])

  const userSubtitle =
    user?.previewRole?.name ?? (user?.roleSlugs?.[0] ? user.roleSlugs[0].replace(/_/g, ' ') : 'Usuario')

  const classicToolbar = user && (
    <div className="flex min-w-0 shrink-0 items-center gap-1.5 sm:gap-2">
      <ThemeToggle />
      {can('auth:assume_role_preview') && (
        <div className="flex min-w-0 max-w-[10.5rem] items-center gap-1 sm:max-w-[13rem]">
          <label className="sr-only" htmlFor="header-role-preview">
            Vista por rol (simulación)
          </label>
          <select
            id="header-role-preview"
            disabled={rolePreviewBusy}
            value={previewSelectValue}
            onChange={(e) => void onPreviewRoleChange(e.target.value)}
            className={`va-field max-w-full cursor-pointer py-1.5 pr-7 text-xs font-medium sm:text-sm ${
              user.previewRole ? 'ring-1 ring-amber-400/60 dark:ring-amber-500/45' : ''
            }`}
            title="Probá la app con otro rol; seguís siendo el mismo usuario."
          >
            <option value="">Mis permisos reales</option>
            {roleOptions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          {user.previewRole ? (
            <span
              className="hidden shrink-0 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium tracking-normal text-amber-800 dark:bg-amber-950/50 dark:text-amber-100 sm:inline"
              title="No es tu sesión operativa habitual: solo permisos simulados."
            >
              Simulando
            </span>
          ) : null}
        </div>
      )}
      <span className="hidden max-w-[7rem] truncate text-sm text-slate-600 sm:inline sm:max-w-[9rem] md:max-w-[14rem] dark:text-slate-300">
        {user.fullName}
      </span>
      <button
        type="button"
        onClick={() => void logout()}
        className={`${isSaas ? 'rounded-lg' : 'rounded-xl'} border border-slate-300 bg-white px-2.5 py-2 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-slate-50 sm:px-3 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700`}
      >
        Salir
      </button>
    </div>
  )

  const saasToolbar = user && (
    <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5 sm:gap-2">
      {!taskMode && (
        <button type="button" className={saasIconButtonClass()} title="Ayuda" aria-label="Ayuda">
          <CircleHelp className="size-[1.125rem]" strokeWidth={1.75} aria-hidden />
        </button>
      )}
      {!taskMode && (
        <button type="button" className={saasIconButtonClass()} title="Notificaciones" aria-label="Notificaciones">
          <Bell className="size-[1.125rem]" strokeWidth={1.75} aria-hidden />
        </button>
      )}
      <ThemeToggle variant="icon" />
      {can('auth:assume_role_preview') && (
        <div className="flex min-w-0 max-w-[9.5rem] items-center gap-1 sm:max-w-[12rem]">
          <label className="sr-only" htmlFor="header-role-preview-saas">
            Vista por rol (simulación)
          </label>
          <select
            id="header-role-preview-saas"
            disabled={rolePreviewBusy}
            value={previewSelectValue}
            onChange={(e) => void onPreviewRoleChange(e.target.value)}
            className={`va-field max-w-full cursor-pointer rounded-lg border-slate-200 py-1.5 pr-6 text-xs font-medium dark:border-slate-600 sm:text-sm ${
              user.previewRole ? 'ring-1 ring-amber-400/50 dark:ring-amber-500/40' : ''
            }`}
            title="Probá la app con otro rol"
          >
            <option value="">Mis permisos</option>
            {roleOptions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="hidden items-center gap-2.5 pl-1 sm:flex">
        <div
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-800 dark:bg-slate-700 dark:text-white"
          aria-hidden
        >
          {initialsFromName(user.fullName)}
        </div>
        <div className="min-w-0 leading-tight">
          <p className="va-app-shell-meta-strong">{user.fullName}</p>
          <p className="va-app-shell-meta capitalize">{userSubtitle}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => void logout()}
        title="Cerrar sesión"
        aria-label="Cerrar sesión"
        className={saasIconButtonClass()}
      >
        <LogOut className="size-[1.125rem]" strokeWidth={1.75} aria-hidden />
      </button>
    </div>
  )

  const horizontalNav =
    links.length > 0 ? (
      <nav
        className={`va-app-shell-subnav border-t border-slate-200 bg-white/95 dark:border-slate-800 dark:bg-slate-950/95 ${isSaas ? 'lg:hidden' : 'bg-slate-100/95 dark:shadow-[inset_0_1px_0_0_rgba(148,163,184,0.08)]'}`}
      >
        <div ref={navOuterRef} className={`relative mx-auto w-full px-3 py-2 sm:px-4 xl:px-5 ${shellMaxClass}`}>
          <div
            ref={navRowRef}
            className="va-app-shell-navlinks relative z-10 -mx-1 flex snap-x snap-proximity items-center gap-1 overflow-x-auto [-ms-overflow-style:none] md:flex-wrap md:overflow-visible md:snap-none [&::-webkit-scrollbar]:hidden"
            aria-label="Navegación principal"
          >
            {links.map((l) => {
              const Icon = l.Icon
              return (
                <NavLink
                  key={l.to}
                  to={l.to}
                  ref={(node) => {
                    if (node) linkRefs.current.set(l.to, node)
                    else linkRefs.current.delete(l.to)
                  }}
                  className={horizontalLinkClass}
                >
                  {isSaas ? <Icon className="size-4 shrink-0" strokeWidth={1.75} aria-hidden /> : null}
                  <span>{l.label}</span>
                </NavLink>
              )
            })}
          </div>
          <div
            aria-hidden
            className={`va-app-shell-nav-pill pointer-events-none absolute z-0 transition-[left,top,width,height,opacity] duration-300 ease-[cubic-bezier(0.25,0.46,0.45,0.94)] motion-reduce:transition-none ${
              pill.visible ? 'opacity-100' : 'opacity-0'
            } ${
              isSaas
                ? ''
                : 'rounded-xl bg-brand-100 shadow-sm ring-1 ring-brand-200/80 dark:bg-brand-900 dark:shadow-md dark:ring-1 dark:ring-brand-600/50'
            }`}
            style={{
              left: pill.left,
              top: pill.top,
              width: Math.max(0, pill.width),
              height: Math.max(0, pill.height),
            }}
          />
        </div>
      </nav>
    ) : null

  return (
    <div
      className={`va-app-shell flex min-h-dvh flex-col bg-slate-100 dark:bg-slate-950 ${isSaas ? 'lg:flex-row lg:items-stretch' : ''}`}
    >
      <a
        href="#app-main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[120] focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-slate-900 focus:shadow-md dark:focus:bg-slate-800 dark:focus:text-slate-100"
      >
        Saltar al contenido principal
      </a>
      {isSaas && (
        <aside
          className={`va-app-shell-sidebar hidden shrink-0 flex-col transition-[width] duration-200 ease-out motion-reduce:transition-none lg:sticky lg:top-0 lg:z-20 lg:flex lg:h-dvh lg:max-h-dvh lg:min-h-0 ${
            saasSidebarCollapsed ? 'w-14 lg:w-14 2xl:w-14' : 'w-64 2xl:w-72'
          }`}
        >
          <div
            className={`flex shrink-0 items-center ${
              saasSidebarCollapsed
                ? 'min-h-[3.5rem] flex-col justify-center gap-1.5 py-2'
                : 'h-[3.5rem] gap-2 px-2.5 sm:px-3.5'
            }`}
          >
            {!saasSidebarCollapsed ? (
              <>
                <BrandDiamond className="size-7 shrink-0 text-brand-600 dark:text-brand-400" />
                <NavLink
                  to="/"
                  className="va-app-shell-brand min-w-0 flex-1 truncate text-[15px] font-semibold tracking-tight text-slate-900 dark:text-slate-50"
                  end
                >
                  Vene Autos
                </NavLink>
                <button
                  type="button"
                  onClick={toggleSaasSidebar}
                  className={`${saasIconButtonClass()} !p-2`}
                  title="Ocultar menú lateral"
                  aria-expanded={!saasSidebarCollapsed}
                  aria-controls="va-saas-sidebar-nav"
                  aria-label="Ocultar menú lateral"
                >
                  <ChevronLeft className="size-4 shrink-0" strokeWidth={2} aria-hidden />
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={toggleSaasSidebar}
                  className={`${saasIconButtonClass()} !p-2`}
                  title="Mostrar menú lateral"
                  aria-expanded={false}
                  aria-controls="va-saas-sidebar-nav"
                  aria-label="Mostrar menú lateral"
                >
                  <ChevronRight className="size-4 shrink-0" strokeWidth={2} aria-hidden />
                </button>
                <NavLink
                  to="/"
                  className="flex shrink-0 rounded-md p-1 text-brand-600 transition hover:bg-white/80 dark:text-brand-400 dark:hover:bg-slate-800/80"
                  title="Inicio"
                  aria-label="Inicio"
                  end
                >
                  <BrandDiamond className="size-6 shrink-0" />
                </NavLink>
              </>
            )}
          </div>
          <nav
            id="va-saas-sidebar-nav"
            className={`flex flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden ${saasSidebarCollapsed ? 'px-1 py-2' : 'p-3'}`}
            aria-label="Navegación principal"
          >
            {links.map((l) => {
              const Icon = l.Icon
              return (
                <NavLink
                  key={l.to}
                  to={l.to}
                  title={l.label}
                  aria-label={saasSidebarCollapsed ? l.label : undefined}
                  className={(args) =>
                    [navLinkSidebarSaasClass(args), saasSidebarCollapsed ? 'justify-center gap-0 px-1.5' : ''].join(' ')
                  }
                >
                  <Icon className="size-[1.125rem] shrink-0" strokeWidth={1.75} aria-hidden />
                  <span className={saasSidebarCollapsed ? 'sr-only' : 'truncate'}>{l.label}</span>
                </NavLink>
              )
            })}
          </nav>
        </aside>
      )}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header
          className={`va-app-shell-header sticky top-0 z-30 border-b border-slate-300/90 backdrop-blur-md dark:border-slate-800 ${isSaas ? 'border-slate-200/90 bg-white/95 dark:bg-slate-900/95' : 'bg-white/95 dark:bg-slate-900/90'}`}
        >
          {isSaas && user ? (
            <div className={`mx-auto flex w-full flex-col gap-2.5 px-3 py-2.5 sm:px-4 sm:py-3 xl:px-5 xl:py-3.5 ${shellMaxClass}`}>
              <div className="flex items-center justify-between gap-2 lg:hidden">
                <NavLink
                  to="/"
                  className="va-app-shell-brand flex min-w-0 items-center gap-2 text-[15px] font-semibold tracking-tight text-slate-900 dark:text-slate-50"
                  end
                >
                  <BrandDiamond className="size-6 shrink-0 text-brand-600 dark:text-brand-400" />
                  <span className="truncate">Vene Autos</span>
                </NavLink>
              </div>
              <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <form
                  className="relative min-w-0 flex-1 sm:max-w-md lg:max-w-xl xl:max-w-2xl"
                  role="search"
                  onSubmit={submitPanelSearch}
                  aria-label="Buscar órdenes de trabajo"
                >
                  <Search
                    className="va-app-shell-search-icon pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400 dark:text-slate-300"
                    strokeWidth={1.75}
                    aria-hidden
                  />
                  <input
                    type="search"
                    name="panel-search"
                    value={panelSearch}
                    onChange={(e) => setPanelSearch(e.target.value)}
                    placeholder="Buscar órdenes (código, patente, cliente…)"
                    title={
                      taskMode
                        ? `Atajo al listado de órdenes. Modo actual: ${taskMode.label}.`
                        : 'Ir al listado de órdenes con filtro de texto.'
                    }
                    className="va-app-shell-search w-full rounded-lg border border-slate-200/90 bg-white py-2 pl-10 pr-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-slate-600 dark:bg-slate-800/90 dark:text-slate-100 dark:focus:border-brand-400 dark:focus:ring-brand-400/30"
                    autoComplete="off"
                    aria-label="Texto a buscar en el listado de órdenes"
                  />
                </form>
                {saasToolbar}
              </div>
              {taskMode && relatedTaskLinks.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-200/80 pb-2.5 pt-2 dark:border-slate-700/70 sm:pb-3 xl:pb-3.5">
                  <span className="rounded-md bg-brand-50 px-2 py-1 text-xs font-medium tracking-normal text-brand-800 dark:bg-brand-900/45 dark:text-brand-100">
                    {taskMode.label}
                  </span>
                  {relatedTaskLinks.map((link) => (
                    <NavLink
                      key={`task-${link.to}`}
                      to={link.to}
                      className={({ isActive }) =>
                        [
                          'rounded-md px-2 py-1 text-xs font-medium tracking-normal transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/35 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900',
                          isActive
                            ? isSaas
                              ? 'bg-[var(--va-accent-soft)] text-brand-900 shadow-sm ring-1 ring-[var(--va-accent-soft-ring)]/90 dark:text-white'
                              : 'bg-brand-100 text-brand-800 dark:bg-brand-900/50 dark:text-brand-100'
                            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white',
                        ].join(' ')
                      }
                    >
                      {link.label}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div
              className={`mx-auto flex w-full items-center justify-between gap-2 px-3 py-3 sm:gap-3 sm:px-4 xl:px-5 ${shellMaxClass} ${isSaas ? 'lg:justify-end' : ''}`}
            >
              <NavLink
                to="/"
                className={`va-app-shell-brand min-w-0 shrink font-semibold tracking-tight text-brand-900 dark:text-brand-100 ${isSaas && user ? 'lg:hidden' : ''}`}
                end
              >
                Vene Autos
              </NavLink>
              {classicToolbar}
            </div>
          )}
          {horizontalNav}
        </header>

        <main
          id="app-main-content"
          className={`va-app-shell-main mx-auto w-full flex-1 px-3 py-4 sm:px-4 sm:py-6 xl:px-5 xl:py-7 ${shellMaxClass}`}
        >
          <Outlet />
        </main>

        <footer className="va-app-shell-footer mt-auto border-t border-slate-300/90 px-3 py-4 text-center text-xs text-slate-600 sm:px-4 xl:px-5 dark:border-slate-800 dark:text-slate-300">
          <div className={`mx-auto text-left ${shellMaxClass}`}>Vene Autos — panel del taller</div>
        </footer>
      </div>
    </div>
  )
}

export function AppShell() {
  return (
    <CashSessionOpenProvider>
      <AppShellInner />
    </CashSessionOpenProvider>
  )
}
