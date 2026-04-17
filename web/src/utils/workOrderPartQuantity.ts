/**
 * Política alineada con `api/src/modules/inventory/inventory.constants.ts`:
 * solo litros y galones permiten decimales en consumo de repuestos en OT.
 */
import type { InventoryItem } from '../api/types'
import { inventoryItemUsesQuarterGallonOtQuantity } from './oilQuarterGallonOt'

const LIQUID_MEASUREMENT_UNIT_SLUGS = new Set<string>(['liter', 'gallon'])

type PartItemHint = Pick<InventoryItem, 'sku' | 'name' | 'category' | 'measurementUnit'>

export function allowsFractionalWorkOrderPartQuantity(measurementUnitSlug: string): boolean {
  return LIQUID_MEASUREMENT_UNIT_SLUGS.has(measurementUnitSlug)
}

/**
 * Aviso / bloqueo previo al envío: cantidad inválida o decimales donde solo van enteros.
 * `null` si no hay problema (o falta ítem y no se puede evaluar).
 */
function parseQuantityInput(quantityStr: string): number | null {
  const raw = quantityStr.trim()
  if (!raw) return null
  const n = Number(raw.replace(',', '.'))
  if (Number.isNaN(n)) return null
  return n
}

function formatQtyForMessage(n: number): string {
  if (!Number.isFinite(n)) return '?'
  const r = Math.round(n * 1e6) / 1e6
  return Number.isInteger(r) ? String(r) : String(r)
}

export function workOrderPartQuantityClientIssue(
  quantityStr: string,
  measurementUnitSlug: string | undefined,
  item?: PartItemHint | null,
): string | null {
  if (!measurementUnitSlug) return null
  const raw = quantityStr.trim()
  if (!raw) return null
  const n = Number(raw.replace(',', '.'))
  if (Number.isNaN(n)) return 'Cantidad no válida.'
  if (n <= 0) return 'La cantidad debe ser mayor a cero.'
  if (item && inventoryItemUsesQuarterGallonOtQuantity(item)) {
    if (!Number.isInteger(n)) {
      return 'Para aceite en galones usá números enteros: 1 = ¼ gal, 2 = ½ gal, 4 = 1 gal.'
    }
    return null
  }
  if (allowsFractionalWorkOrderPartQuantity(measurementUnitSlug)) return null
  if (!Number.isInteger(n)) {
    return 'Este repuesto va por unidad entera (1, 2, 3…). Para fluidos elegí un ítem en litros o galones.'
  }
  return null
}

/**
 * Cantidad mayor al tope permitido (stock en mano para línea nueva, o máximo al editar).
 * Debe llamarse después de {@link workOrderPartQuantityClientIssue} (sin error de formato/unidad).
 * Para aceite en galón, `quantityStr` son **cuartos**; `maxQuantity` sigue en **galones** (inventario).
 */
export function workOrderPartStockClientIssue(
  quantityStr: string,
  maxQuantity: number | null,
  item?: PartItemHint | null,
): string | null {
  if (maxQuantity === null || !Number.isFinite(maxQuantity)) return null
  const qty = parseQuantityInput(quantityStr)
  if (qty === null || qty <= 0) return null
  const effectiveGallons =
    item && inventoryItemUsesQuarterGallonOtQuantity(item) ? qty * 0.25 : qty
  const eps = 1e-9
  if (effectiveGallons > maxQuantity + eps) {
    const pedido =
      item && inventoryItemUsesQuarterGallonOtQuantity(item)
        ? `${formatQtyForMessage(effectiveGallons)} gal (${formatQtyForMessage(qty)}×¼)`
        : formatQtyForMessage(effectiveGallons)
    return `Stock insuficiente: el máximo permitido es ${formatQtyForMessage(maxQuantity)} y pediste ${pedido}.`
  }
  return null
}
