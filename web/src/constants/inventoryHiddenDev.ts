/** Panel inventario · modo desarrollador (lista SKU ocultos). */
export const LS_INVENTORY_HIDDEN_DEV = 'vene_inventory_hidden_dev_panel'

/** Clave anterior (solo cotización); se migra al leer. */
const LS_LEGACY_QUOTE_STUB_DEV = 'vene_inventory_quote_stub_dev'

export function readInventoryHiddenDevEnabled(): boolean {
  try {
    if (localStorage.getItem(LS_INVENTORY_HIDDEN_DEV) === '1') return true
    if (localStorage.getItem(LS_LEGACY_QUOTE_STUB_DEV) === '1') return true
    return false
  } catch {
    return false
  }
}

export function setInventoryHiddenDevEnabled(on: boolean): void {
  try {
    localStorage.removeItem(LS_LEGACY_QUOTE_STUB_DEV)
    if (on) localStorage.setItem(LS_INVENTORY_HIDDEN_DEV, '1')
    else localStorage.removeItem(LS_INVENTORY_HIDDEN_DEV)
  } catch {
    /* */
  }
}
