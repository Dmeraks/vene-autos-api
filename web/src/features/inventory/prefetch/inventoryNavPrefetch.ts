import type { QueryClient } from '@tanstack/react-query'
import { STALE_INVENTORY_CATALOG_MS } from '../../../constants/queryStaleTime'
import { queryKeys } from '../../../lib/queryKeys'
import { fetchInventoryItemsForQuery, fetchMeasurementUnitsForQuery } from '../services/inventoryCatalogApi'

const INVENTORY_QUERY_GC_MS = 20 * 60_000

/**
 * Hover en «Repuestos», «Recepción» o «Aceite»: catálogo listo al navegar (misma `queryKey` que las páginas).
 */
export function prefetchInventoryCatalog(queryClient: QueryClient): void {
  void queryClient.prefetchQuery({
    queryKey: queryKeys.inventory.items(),
    queryFn: ({ signal }) => fetchInventoryItemsForQuery(signal),
    staleTime: STALE_INVENTORY_CATALOG_MS,
    gcTime: INVENTORY_QUERY_GC_MS,
  })
  void queryClient.prefetchQuery({
    queryKey: queryKeys.inventory.measurementUnits(),
    queryFn: ({ signal }) => fetchMeasurementUnitsForQuery(signal),
    staleTime: STALE_INVENTORY_CATALOG_MS,
    gcTime: INVENTORY_QUERY_GC_MS,
  })
}
