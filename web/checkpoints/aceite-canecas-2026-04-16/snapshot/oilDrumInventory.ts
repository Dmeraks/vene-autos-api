import type { InventoryItem } from '../api/types'

/**
 * Detecta ítems de inventario pensados como aceite en caneca/tambor de ~55 gal US (≈208 L).
 * Se usa texto libre en categoría, nombre o SKU (mismo criterio que verá el usuario en Repuestos).
 */
export function inventoryItemIsOilDrum55Gallon(item: Pick<InventoryItem, 'sku' | 'name' | 'category'>): boolean {
  const blob = `${item.category ?? ''} ${item.name ?? ''} ${item.sku ?? ''}`.toLowerCase()
  const mentionsOil =
    /\baceite\b/.test(blob) || blob.includes('lubricante') || /\boil\b/.test(blob) || blob.includes('motor')
  const mentionsLargePack =
    /\b55\b/.test(blob) ||
    blob.includes('55 gal') ||
    blob.includes('galón') ||
    blob.includes('galon') ||
    blob.includes('caneca') ||
    blob.includes('tambor') ||
    blob.includes('drum') ||
    blob.includes('208 l') ||
    blob.includes('208l')
  return mentionsOil && mentionsLargePack
}

/** Categoría sugerida al dar de alta en Repuestos para que el ítem aparezca en Aceite. */
export const OIL_DRUM_CATEGORY_HINT = 'Aceite — caneca 55 gal (US)'
