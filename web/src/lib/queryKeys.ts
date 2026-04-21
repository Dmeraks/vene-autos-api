/**
 * Fábricas de query keys para TanStack React Query (cuando se integre).
 * Mantener keys serializables y determinísticas para deduplicación y persistencia.
 *
 * Uso futuro:
 *   useQuery({ queryKey: queryKeys.cash.openStatus(), queryFn: fetchCashSessionOpenStatus })
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
  },
} as const
