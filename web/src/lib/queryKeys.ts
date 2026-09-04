/**
 * Fábricas de query keys para TanStack React Query.
 * Mantener keys serializables y determinísticas para deduplicación y persistencia.
 *
 * Uso:
 *   useQuery({ queryKey: queryKeys.cash.categories(), queryFn: fetchCashCategories })
 *   useQuery({ queryKey: queryKeys.workOrders.detail(id), queryFn: fetchWorkOrderDetail })
 */

export const queryKeys = {
  cash: {
    root: ['cash'] as const,
    /** GET /cash/sessions/open-status — usado por CashSessionOpenProvider (polling ~45s). */
    openStatus: () => [...queryKeys.cash.root, 'open-status'] as const,
    /** Key completa por usuario (JWT / sesión) para no mezclar estado al cambiar de cuenta. */
    openStatusForUser: (userId: string | undefined) =>
      [...queryKeys.cash.openStatus(), userId ?? 'anon'] as const,
    /** GET /cash/sessions/current */
    currentSession: () => [...queryKeys.cash.root, 'current-session'] as const,
    /** GET /cash/sessions */
    sessionsList: () => [...queryKeys.cash.root, 'sessions-list'] as const,
    /** GET /cash/categories */
    categories: () => [...queryKeys.cash.root, 'categories'] as const,
    /** Prefijo para listas de solicitudes (invalidar todas las variantes de filtro). */
    expenseRequestsRoot: () => [...queryKeys.cash.root, 'expense-requests'] as const,
    /** GET /cash/expense-requests con filtro opcional (`status` vacío = todos). */
    expenseRequestsList: (statusFilter: string) =>
      [...queryKeys.cash.expenseRequestsRoot(), statusFilter || 'all'] as const,
    /** GET /users + GET /cash/delegates (pestaña Delegados). */
    delegatesBundle: () => [...queryKeys.cash.root, 'delegates-bundle'] as const,
  },
  reports: {
    root: ['reports'] as const,
    /** GET /reports/economic-summary — widget ventas / panel (pendiente). */
    economicSummary: (params: { from: string; to: string; granularity?: string }) =>
      [...queryKeys.reports.root, 'economic-summary', params.from, params.to, params.granularity ?? 'day'] as const,
  },
  quotes: {
    root: ['quotes'] as const,
    list: (params: { filterKey: string; page: number; pageSize: number }) =>
      [...queryKeys.quotes.root, 'list', params.filterKey, params.page, params.pageSize] as const,
    detail: (id: string) => [...queryKeys.quotes.root, 'detail', id] as const,
  },
  workOrders: {
    root: ['workOrders'] as const,
    /**
     * Lista paginada GET /work-orders — deduplica por filtros (`listFetchFilterKey`), página y tamaño.
     */
    list: (params: { filterKey: string; page: number; pageSize: number }) =>
      [...queryKeys.workOrders.root, 'list', params.filterKey, params.page, params.pageSize] as const,
    /** GET /work-orders/:id — detalle (prefetch desde listado + caché en detalle). */
    detail: (id: string) => [...queryKeys.workOrders.root, 'detail', id] as const,
    /** GET /work-orders/:id/lines — líneas de la orden (agregar/editar/quitar). */
    lines: (id: string) => [...queryKeys.workOrders.detail(id), 'lines'] as const,
    /** GET /work-orders/:id/payments — cobros registrados. */
    payments: (id: string) => [...queryKeys.workOrders.detail(id), 'payments'] as const,
    /** GET /work-orders/assignable-users — usuarios a los que reasignar. */
    assignableUsers: () => [...queryKeys.workOrders.root, 'assignable-users'] as const,
  },
  inventory: {
    root: ['inventory'] as const,
    /** GET /inventory/items — repuestos activos con stock. */
    items: () => [...queryKeys.inventory.root, 'items'] as const,
    /** GET /inventory/items/hidden-items — ítems inactivos (modo desarrollador). */
    hiddenItems: () => [...queryKeys.inventory.root, 'hidden-items'] as const,
    /** GET /inventory/measurement-units — unidades de medida. */
    measurementUnits: () => [...queryKeys.inventory.root, 'measurement-units'] as const,
    /** GET /inventory/items/oil-drum-economics — economía canecas (pantalla Aceite). */
    oilDrumEconomics: () => [...queryKeys.inventory.root, 'oil-drum-economics'] as const,
  },
  settings: {
    root: ['settings'] as const,
    /** GET /settings — mapa de claves del taller (pantalla Configuración). */
    tenantMap: () => [...queryKeys.settings.root, 'tenant-map'] as const,
  },
  users: {
    root: ['users'] as const,
    /** GET /users — índice de cuentas (admin / soporte en configuración). */
    list: () => [...queryKeys.users.root, 'list'] as const,
  },
  employeeCredits: {
    root: ['employeeCredits'] as const,
    summary: () => [...queryKeys.employeeCredits.root, 'summary'] as const,
    debtorCandidates: () => [...queryKeys.employeeCredits.root, 'debtor-candidates'] as const,
    lines: (debtorUserId: string) => [...queryKeys.employeeCredits.root, 'lines', debtorUserId] as const,
  },
  shared: {
    root: ['shared'] as const,
    /** GET /services — catálogo de servicios (Fase 2). */
    services: () => [...queryKeys.shared.root, 'services'] as const,
    /** GET /tax-rates — catálogo de impuestos (Fase 2). */
    taxRates: () => [...queryKeys.shared.root, 'tax-rates'] as const,
    /** GET /settings/ui-context — configuración de UI (notas mínimas, etc.). */
    uiContext: () => [...queryKeys.shared.root, 'ui-context'] as const,
  },
} as const
