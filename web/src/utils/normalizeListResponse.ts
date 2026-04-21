/**
 * GET de listas suele devolver `T[]`; algunos clientes antiguos esperaban `{ items: T[] }`.
 */
export function normalizeListResponse<T>(r: unknown): T[] {
  if (Array.isArray(r)) return r as T[]
  if (r && typeof r === 'object' && Array.isArray((r as { items?: unknown }).items)) {
    return (r as { items: T[] }).items
  }
  return []
}
