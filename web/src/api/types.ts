/** Tipos mínimos alineados con el API Nest (fase 5). */

export type WorkOrderStatus =
  | 'RECEIVED'
  | 'IN_WORKSHOP'
  | 'WAITING_PARTS'
  | 'READY'
  | 'DELIVERED'
  | 'CANCELLED'

export type WorkOrderLineType = 'PART' | 'LABOR'

export type MeasurementUnit = {
  id: string
  slug: string
  name: string
}

export type InventoryItem = {
  id: string
  sku: string
  name: string
  quantityOnHand: string
  trackStock: boolean
  isActive: boolean
  averageCost: string | null
  measurementUnit: MeasurementUnit
}

export type WorkOrderLine = {
  id: string
  lineType: WorkOrderLineType
  sortOrder: number
  inventoryItemId: string | null
  description: string | null
  quantity: string
  unitPrice: string | null
  inventoryItem: InventoryItem | null
}

export type WorkOrderSummary = {
  id: string
  orderNumber: number
  status: WorkOrderStatus
  description: string
  customerName: string | null
  vehiclePlate: string | null
  createdAt: string
  authorizedAmount?: string | null
}

export type WorkOrderDetail = WorkOrderSummary & {
  lines: WorkOrderLine[]
  linesSubtotal: string
  authorizedAmount?: string | null
  paymentSummary: {
    paymentCount: number
    totalPaid: string
    remaining: string | null
  }
}

export type AuthUser = {
  id: string
  email: string
  fullName: string
  permissions: string[]
}

export type LoginResponse = {
  accessToken: string
  tokenType: 'Bearer'
  user: AuthUser
}

/** Fila de GET `/permissions` (catálogo para roles). */
export type PermissionRow = {
  id: string
  resource: string
  action: string
  description: string | null
}

/** Cuerpo de POST `/work-orders` (CreateWorkOrderDto). */
export type CreateWorkOrderPayload = {
  description: string
  customerName?: string
  customerPhone?: string
  vehiclePlate?: string
  vehicleNotes?: string
  internalNotes?: string
  assignedToId?: string
  vehicleId?: string
  authorizedAmount?: string
}
