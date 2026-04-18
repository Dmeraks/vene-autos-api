import type { InventoryItem } from '../api/types'

type OilOtItem = Pick<InventoryItem, 'sku' | 'name' | 'category' | 'measurementUnit'>

/**
 * Aceite/lubricante medido en galones: en OT la cantidad se informa en **cuartos** (1 = ¼ gal).
 * Alineado con `api/src/modules/inventory/oil-gallon-ot.ts`.
 */
export function inventoryItemUsesQuarterGallonOtQuantity(item: OilOtItem): boolean {
  if (item.measurementUnit.slug !== 'gallon') return false
  const blob = `${item.category ?? ''} ${item.name ?? ''} ${item.sku ?? ''}`.toLowerCase()
  return /\baceite\b/.test(blob) || /\blubricante\b/.test(blob) || /\boil\b/.test(blob)
}

/**
 * `WorkOrderLine.unitPrice` en API se guarda en COP **por galón**; en pantalla el usuario
 * trabaja con COP **por ¼ galón** para aceite en galón.
 */
export function workOrderOilStoredGallonUnitPriceToQuarterPriceString(
  unitPriceStored: string | null | undefined,
): string {
  if (unitPriceStored == null || String(unitPriceStored).trim() === '') return ''
  const n = Number(String(unitPriceStored).replace(',', '.'))
  if (!Number.isFinite(n)) return String(unitPriceStored).trim()
  return String(Math.round(n / 4))
}

/** Texto auxiliar en filas de tabla (cantidad ya en galones en API). */
export function partLineQuantityDisplayWithQuarters(
  quantityStr: string,
  item: OilOtItem | null | undefined,
): string {
  if (!item || !inventoryItemUsesQuarterGallonOtQuantity(item)) return quantityStr
  const g = Number(String(quantityStr).replace(',', '.'))
  if (!Number.isFinite(g)) return quantityStr
  const q = Math.round(g * 4)
  if (Math.abs(g * 4 - q) > 1e-6) return quantityStr
  return `${quantityStr} gal (${q}×¼)`
}
