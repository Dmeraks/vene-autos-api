/**
 * Tiempos de frescura (TanStack Query) alineados con UX + menos carga al backend.
 * El cliente global usa 30s por defecto; las queries pueden refinar.
 */
/** Listados operativos (OT, movimientos de caja, sesión actual). */
export const STALE_OPERATIONAL_MS = 30_000

/** Catálogos y datos que cambian pocas veces al día. */
export const STALE_SEMI_STATIC_MS = 60_000
