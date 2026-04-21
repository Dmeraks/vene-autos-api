/** Referencia en `InventoryMovement.referenceType` hacia una línea de OT. */
export const INVENTORY_REF_WORK_ORDER_LINE = 'WorkOrderLine';

/** Referencia hacia una línea de recepción de compra. */
export const INVENTORY_REF_PURCHASE_RECEIPT_LINE = 'PurchaseReceiptLine';

/** Referencia en `InventoryMovement.referenceType` hacia una línea de venta (Fase 3). */
export const INVENTORY_REF_SALE_LINE = 'SaleLine';

/** Clave en `workshop_counters` para el siguiente SKU de repuesto creado desde cotización (sin stock). */
export const WORKSHOP_COUNTER_AD_HOC_SKU_KEY = 'inventory_ad_hoc_sku';

/** Prefijo visible del SKU automático (ej. VEN-Q-000001). Debe terminar en guion para `normalizeInventorySkuNumeracion`. */
export const AD_HOC_QUOTE_SKU_PREFIX = 'VEN-Q';

/** Cantidades en línea (hasta 4 decimales, ej. litros). */
export const QTY_DECIMAL_REGEX = /^\d+(\.\d{1,4})?$/;

/**
 * Unidades de volumen (líquidos): en consumo de OT se permiten cantidades con decimales.
 * Repuestos con otra unidad (p. ej. `unit`) deben consumirse en unidades enteras.
 */
export const LIQUID_MEASUREMENT_UNIT_SLUGS = new Set<string>(['liter', 'gallon']);

export function allowsFractionalWorkOrderPartQuantity(measurementUnitSlug: string): boolean {
  return LIQUID_MEASUREMENT_UNIT_SLUGS.has(measurementUnitSlug);
}

/**
 * Deja el sufijo numérico del SKU con al menos 2 dígitos tras el último guion (…-01, …-09, …-100).
 * Ej.: `VEN-SEN-1` → `VEN-SEN-01`; `VE-GEN-10` sin cambios.
 */
export function normalizeInventorySkuNumeracion(sku: string): string {
  const t = sku.trim();
  const m = t.match(/^(.*-)(\d+)$/);
  if (!m) {
    return t;
  }
  const head = m[1];
  const digits = m[2];
  const next = digits.length < 2 ? digits.padStart(2, '0') : digits;
  return head + next;
}
