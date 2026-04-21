/**
 * TanStack Query (@tanstack/react-query) — migración incremental.
 *
 * Hecho:
 * - `QueryClientProvider` + `createAppQueryClient()` en `main.tsx`
 * - `CashSessionOpenProvider` usa `useQuery` con `queryKeys.cash.openStatusForUser(userId)`;
 *   mismo contrato público (`open`, `loadStatus`, `refresh`).
 *
 * Hecho (work-orders listado):
 * - `useWorkOrdersPageModel`: `useQuery` + `queryKeys.workOrders.list(...)` + `fetchWorkOrdersList`;
 *   evento `WORK_ORDER_CHANGED_EVENT` y `loadPage()` invalidan `queryKeys.workOrders.root`.
 *
 * Siguiente (opcional):
 * - CashPage `loadCore` → queries `currentSession` / `sessionsList` + invalidación tras movimientos.
 * - Dashboard `useSalesToday` → `queryKeys.reports.economicSummary` + `fetchEconomicSummary`.
 *
 * Invalidación tras mutaciones de caja: `queryClient.invalidateQueries({ queryKey: queryKeys.cash.root })`
 * (matchea todas las queries bajo `cash`).
 */

export {}
