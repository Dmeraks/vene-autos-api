/** Resultado de GET `/vehicles/search` (listado alta OT). */
export type WorkOrdersVehicleHit = {
  id: string
  plate: string
  brand: string | null
  model: string | null
  customer: { id: string; displayName: string; primaryPhone: string | null }
}

/** Vehículos del cliente — misma forma que GET `/customers/:id/vehicles`. */
export type WorkOrdersWarrantyVehicleOption = {
  id: string
  plate: string
  brand: string | null
  model: string | null
  isActive: boolean
}
