/** Referencia en `InventoryMovement.referenceType` hacia una línea de OT. */
export const INVENTORY_REF_WORK_ORDER_LINE = 'WorkOrderLine';

/** Referencia hacia una línea de recepción de compra. */
export const INVENTORY_REF_PURCHASE_RECEIPT_LINE = 'PurchaseReceiptLine';

/** Cantidades en línea (hasta 4 decimales, ej. litros). */
export const QTY_DECIMAL_REGEX = /^\d+(\.\d{1,4})?$/;
