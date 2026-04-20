import {
  BarChart3,
  ClipboardList,
  Droplet,
  Inbox,
  LocateFixed,
  Package,
  ScrollText,
  Settings,
  Shield,
  Users,
  UsersRound,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { portalPath, stripPortalBase } from '../constants/portalPath'
import { PageHeader } from '../components/layout/PageHeader'
import { useCashSessionOpen } from '../context/CashSessionOpenContext'
import { usePanelTheme } from '../theme/PanelThemeProvider'
import { getStoredLastModulePath } from '../utils/lastModule'

type DashboardModule = {
  to: string
  title: string
  description: string
  icon: LucideIcon
  show: boolean
  enabled: boolean
  hint?: string
}

type DashboardSection = {
  title: string
  description: string
  modules: DashboardModule[]
}

const MODULE_PRIORITY: Record<string, number> = {
  [portalPath('/caja')]: 120,
  [portalPath('/ordenes')]: 110,
  [portalPath('/recepcion')]: 95,
  [portalPath('/inventario')]: 90,
  [portalPath('/aceite')]: 85,
  [portalPath('/clientes')]: 70,
  [portalPath('/informes')]: 60,
  [portalPath('/admin/usuarios')]: 45,
  [portalPath('/admin/roles')]: 40,
  [portalPath('/admin/auditoria')]: 35,
  [portalPath('/admin/configuracion')]: 30,
}

function modulePriority(module: DashboardModule): number {
  return MODULE_PRIORITY[module.to] ?? 10
}

function sectionPriority(section: DashboardSection): number {
  const enabledModules = section.modules.filter((module) => module.enabled)
  const source = enabledModules.length > 0 ? enabledModules : section.modules
  const topModulePriority = source.reduce((max, module) => Math.max(max, modulePriority(module)), 0)
  return topModulePriority + enabledModules.length * 3
}

export function DashboardPage() {
  const { can, user } = useAuth()
  const { open: cashSessionOpen } = useCashSessionOpen()
  const panelTheme = usePanelTheme()
  const isSaas = panelTheme === 'saas_light'

  const sections: DashboardSection[] = [
    {
      title: 'Operación diaria',
      description: 'Acciones principales del taller para caja, órdenes e inventario.',
      modules: [
        {
          to: portalPath('/caja'),
          title: 'Caja',
          description: 'Abrir/cerrar sesión de caja y registrar movimientos.',
          icon: Wallet,
          show: can('cash_sessions:read'),
          enabled: true,
        },
        {
          to: portalPath('/ordenes'),
          title: 'Órdenes',
          description: 'Seguimiento de órdenes de trabajo y cobros por orden.',
          icon: ClipboardList,
          show: can('work_orders:read') || can('work_orders:read_portal'),
          enabled: true,
        },
        {
          to: portalPath('/inventario'),
          title: 'Repuestos',
          description: 'Consulta de ítems, stock y costos de inventario.',
          icon: Package,
          show: can('inventory_items:read'),
          enabled: true,
        },
        {
          to: portalPath('/aceite'),
          title: 'Aceite',
          description: 'Control de canecas, consumos y costos por OT.',
          icon: Droplet,
          show: can('inventory_items:read'),
          enabled: true,
        },
        {
          to: portalPath('/recepcion'),
          title: 'Recepción',
          description: 'Registrar entradas de stock y compras del día.',
          icon: Inbox,
          show: can('purchase_receipts:create'),
          enabled: cashSessionOpen === true,
          hint: cashSessionOpen === true ? undefined : 'Requiere caja abierta',
        },
      ],
    },
    {
      title: 'Clientes y análisis',
      description: 'Gestión comercial y visibilidad de resultados del taller.',
      modules: [
        {
          to: portalPath('/clientes'),
          title: 'Clientes',
          description: 'Gestionar clientes, vehículos y su historial.',
          icon: Users,
          show: can('customers:read'),
          enabled: true,
        },
        {
          to: portalPath('/informes'),
          title: 'Informes',
          description: 'Métricas de actividad, ingresos y desempeño operativo.',
          icon: BarChart3,
          show: can('reports:read'),
          enabled: true,
        },
      ],
    },
    {
      title: 'Administración',
      description: 'Gestión de permisos, auditoría y parámetros globales.',
      modules: [
        {
          to: portalPath('/admin/usuarios'),
          title: 'Usuarios',
          description: 'Alta de cuentas, estado y asignación de roles.',
          icon: UsersRound,
          show: can('users:read'),
          enabled: true,
        },
        {
          to: portalPath('/admin/roles'),
          title: 'Roles',
          description: 'Diseñar perfiles de acceso por permisos.',
          icon: Shield,
          show: can('roles:read'),
          enabled: true,
        },
        {
          to: portalPath('/admin/auditoria'),
          title: 'Auditoría',
          description: 'Revisar trazabilidad de acciones y cambios.',
          icon: ScrollText,
          show: can('audit:read'),
          enabled: true,
        },
        {
          to: portalPath('/admin/configuracion'),
          title: 'Configuración',
          description: 'Parámetros del taller, políticas y soporte.',
          icon: Settings,
          show: can('settings:read'),
          enabled: true,
        },
      ],
    },
  ]

  const visibleSections = sections
    .map((section) => ({
      ...section,
      modules: section.modules.filter((module) => module.show),
    }))
    .map((section) => ({
      ...section,
      modules: [...section.modules].sort((a, b) => {
        if (a.enabled !== b.enabled) return a.enabled ? -1 : 1
        return modulePriority(b) - modulePriority(a)
      }),
    }))
    .filter((section) => section.modules.length > 0)
    .sort((a, b) => sectionPriority(b) - sectionPriority(a))
  const operationSection = visibleSections.find((section) => section.title === 'Operación diaria')
  const adminSection = visibleSections.find((section) => section.title === 'Administración')
  const midSections = visibleSections.filter(
    (section) => section.title !== 'Operación diaria' && section.title !== 'Administración',
  )
  const orderedSections = [
    ...(operationSection ? [operationSection] : []),
    ...midSections,
    ...(adminSection ? [adminSection] : []),
  ]

  const totalModules = orderedSections.reduce((acc, section) => acc + section.modules.length, 0)
  const enabledModules = orderedSections.reduce(
    (acc, section) => acc + section.modules.filter((module) => module.enabled).length,
    0,
  )
  const quickActions = orderedSections
    .flatMap((section) => section.modules)
    .filter((module) => module.enabled)
    .sort((a, b) => modulePriority(b) - modulePriority(a))
    .slice(0, 4)
  const moduleByPath = new Map(
    orderedSections
      .flatMap((section) => section.modules)
      .map((module) => [stripPortalBase(module.to), module]),
  )
  const resumeModulePath = getStoredLastModulePath()
  const resumeModule = resumeModulePath ? moduleByPath.get(resumeModulePath) ?? null : null
  const quickActionsWithoutResume = resumeModule
    ? quickActions.filter((module) => module.to !== resumeModule.to)
    : quickActions
  const todayFocus = operationSection
    ? operationSection.modules.filter((module) => module.enabled).slice(0, 3)
    : []
  const lockedToday = operationSection
    ? operationSection.modules.filter((module) => !module.enabled)
    : []

  const cardClass = isSaas
    ? 'group va-saas-module-card'
    : 'group min-h-[9.5rem] rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/35 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-slate-700 dark:bg-slate-900 dark:focus-visible:ring-offset-slate-900'
  const mutedCardClass =
    'rounded-2xl border border-dashed border-slate-300/90 bg-slate-50 p-4 text-slate-500 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300'
  const sectionClass = isSaas ? 'va-saas-page-section' : 'space-y-3'

  if (visibleSections.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Panel principal"
          description={`Hola, ${user?.fullName ?? 'equipo'}. No hay módulos visibles con tus permisos actuales.`}
        />
        <div className={mutedCardClass}>
          Pedile a un administrador que te asigne permisos para ver las secciones operativas.
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 lg:space-y-7">
      <PageHeader
        title="Panel principal"
        description={
          <>
            <p className="break-words">
              Accesos rápidos por módulo para optimizar el flujo diario del taller.
            </p>
            {quickActions.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {resumeModule && (
                  <Link
                    to={resumeModule.to}
                    className="inline-flex max-w-full min-h-[40px] flex-wrap items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm font-semibold text-brand-800 shadow-sm transition hover:bg-brand-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/35 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-brand-500/60 dark:bg-brand-900/55 dark:text-brand-50 dark:hover:bg-brand-900/75 dark:focus-visible:ring-offset-slate-900"
                  >
                    <LocateFixed className="size-6 shrink-0" strokeWidth={1.75} aria-hidden />
                    <span className="min-w-0 break-words">Continuar: {resumeModule.title}</span>
                  </Link>
                )}
                {quickActionsWithoutResume.map((action) => {
                  const Icon = action.icon
                  return (
                    <Link
                      key={action.to}
                      to={action.to}
                      className="inline-flex max-w-full min-h-[40px] flex-wrap items-center gap-2 rounded-lg border border-slate-200/90 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-brand-200 hover:text-brand-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/35 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-brand-700 dark:hover:text-brand-200 dark:focus-visible:ring-offset-slate-900"
                    >
                      <Icon className="size-6 shrink-0" strokeWidth={1.75} aria-hidden />
                      <span className="min-w-0 break-words">{action.title}</span>
                    </Link>
                  )
                })}
              </div>
            )}
            <div className="mt-4 grid grid-cols-1 gap-3 min-[520px]:grid-cols-3">
              <div className="min-w-0 rounded-xl border border-slate-200/90 bg-slate-50/80 px-3 py-2.5 dark:border-slate-600/80 dark:bg-slate-800/60 dark:ring-1 dark:ring-slate-600/30">
                <p
                  className="text-xs font-medium leading-snug tracking-tight text-slate-600 dark:text-slate-300"
                  title="Módulos del panel que ves con tu perfil actual"
                >
                  Módulos visibles
                </p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">{totalModules}</p>
              </div>
              <div className="min-w-0 rounded-xl border border-slate-200/90 bg-slate-50/80 px-3 py-2.5 dark:border-slate-600/80 dark:bg-slate-800/60 dark:ring-1 dark:ring-slate-600/30">
                <p
                  className="text-xs font-medium leading-snug tracking-tight text-slate-600 dark:text-slate-300"
                  title="Módulos que podés abrir en este momento (sin bloqueos temporales)"
                >
                  Disponibles ahora
                </p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">{enabledModules}</p>
              </div>
              <div className="min-w-0 rounded-xl border border-slate-200/90 bg-slate-50/80 px-3 py-2.5 dark:border-slate-600/80 dark:bg-slate-800/60 dark:ring-1 dark:ring-slate-600/30">
                <p
                  className="text-xs font-medium leading-snug tracking-tight text-slate-600 dark:text-slate-300"
                  title="Módulos visibles pero no disponibles (p. ej. requieren caja abierta)"
                >
                  Bloqueados temporalmente
                </p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                  {Math.max(totalModules - enabledModules, 0)}
                </p>
              </div>
            </div>
          </>
        }
      />

      {todayFocus.length > 0 && (
        <section className={sectionClass}>
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="va-section-title">En foco hoy</h2>
              <p className="mt-0.5 max-w-prose text-sm leading-relaxed text-slate-500 dark:text-slate-300">
                Prioridades operativas sugeridas para esta sesión.
              </p>
            </div>
            <span className="rounded-lg border border-brand-200/80 bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-800 dark:border-brand-700/70 dark:bg-brand-900/40 dark:text-brand-200">
              {cashSessionOpen ? 'Caja abierta' : 'Caja cerrada'}
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {todayFocus.map((module) => {
              const Icon = module.icon
              return (
                <Link key={`focus-${module.to}`} to={module.to} className={cardClass}>
                  <div className="flex items-start gap-3">
                    <div className="rounded-lg border border-brand-200/80 bg-brand-50 p-3 text-brand-700 dark:border-brand-700/70 dark:bg-brand-900/40 dark:text-brand-200">
                      <Icon className="size-7" strokeWidth={1.65} aria-hidden />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{module.title}</p>
                      <p className="mt-1 text-sm leading-snug text-slate-600 dark:text-slate-300 [overflow-wrap:anywhere]">
                        {module.description}
                      </p>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
          {lockedToday.length > 0 && (
            <div className="rounded-xl border border-amber-200/80 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
              {lockedToday.map((module) => module.hint).filter(Boolean).join(' · ')}
            </div>
          )}
        </section>
      )}

      {orderedSections.map((section) => (
        <section key={section.title} className={sectionClass}>
          <div>
            <h2 className="va-section-title">{section.title}</h2>
            <p className="mt-0.5 max-w-prose text-sm leading-relaxed text-slate-500 dark:text-slate-300">
              {section.description}
            </p>
          </div>
          <div
            className={`grid gap-3 sm:grid-cols-2 ${section.title === 'Administración' ? 'xl:grid-cols-2 2xl:grid-cols-3' : 'lg:grid-cols-3 2xl:grid-cols-4'}`}
          >
            {section.modules.map((module) => {
              const Icon = module.icon
              if (!module.enabled) {
                return (
                  <div key={module.title} className={`${mutedCardClass} min-h-[9.5rem]`}>
                    <div className="flex items-start gap-3">
                      <div className="rounded-lg border border-slate-200 bg-white p-3 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        <Icon className="size-7" strokeWidth={1.65} aria-hidden />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{module.title}</p>
                        <p className="mt-1 text-sm leading-snug [overflow-wrap:anywhere]">{module.description}</p>
                        {module.hint ? (
                          <p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-300">{module.hint}</p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                )
              }
              return (
                <Link
                  key={module.title}
                  to={module.to}
                  className={`${cardClass} focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/35 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900`}
                >
                  <div className="flex items-start gap-3">
                    <div className="rounded-lg border border-brand-200/80 bg-brand-50 p-3 text-brand-700 dark:border-brand-700/70 dark:bg-brand-900/40 dark:text-brand-200">
                      <Icon className="size-7" strokeWidth={1.65} aria-hidden />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{module.title}</p>
                      <p className="mt-1 text-sm leading-snug text-slate-600 dark:text-slate-300 [overflow-wrap:anywhere]">
                        {module.description}
                      </p>
                      <p className="mt-2 text-xs font-medium text-brand-700 dark:text-brand-300">Abrir módulo</p>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
