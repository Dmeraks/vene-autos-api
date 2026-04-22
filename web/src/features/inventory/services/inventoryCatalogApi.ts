import { api } from '../../../api/client'
import type { InventoryItem, MeasurementUnit, OilDrumEconomicsResponse } from '../../../api/types'

export function fetchInventoryItemsForQuery(signal?: AbortSignal): Promise<InventoryItem[]> {
  return api<InventoryItem[]>('/inventory/items', { signal })
}

export function fetchInventoryHiddenItemsForQuery(signal?: AbortSignal): Promise<InventoryItem[]> {
  return api<InventoryItem[]>('/inventory/items/hidden-items', { signal })
}

export function fetchMeasurementUnitsForQuery(signal?: AbortSignal): Promise<MeasurementUnit[]> {
  return api<MeasurementUnit[]>('/inventory/measurement-units', { signal })
}

export function fetchOilDrumEconomicsForQuery(signal?: AbortSignal): Promise<OilDrumEconomicsResponse> {
  return api<OilDrumEconomicsResponse>('/inventory/items/oil-drum-economics', { signal })
}
