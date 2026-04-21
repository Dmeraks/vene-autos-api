import type { SaleOrigin, SaleStatus } from '../../api/types'

export const SALES_STATUS_LABEL: Record<SaleStatus, string> = {
  DRAFT: 'Borrador',
  CONFIRMED: 'Confirmada',
  CANCELLED: 'Anulada',
}

export const SALES_ORIGIN_LABEL: Record<SaleOrigin, string> = {
  COUNTER: 'Mostrador',
  WORK_ORDER: 'Desde OT',
}
