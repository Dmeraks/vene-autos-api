import type { WorkOrderStatus } from '../../../api/types'

/**
 * Estados que cuentan como pendientes hasta que la OT pasa a entregada.
 * (Entregadas y canceladas no son alerta en la campana.)
 */
export type AlertPipelineStatus =
  | 'UNASSIGNED'
  | 'RECEIVED'
  | 'IN_WORKSHOP'
  | 'WAITING_PARTS'
  | 'READY'

export const WO_STATUS_TITLE_ES: Record<AlertPipelineStatus, string> = {
  UNASSIGNED: 'Sin asignar',
  RECEIVED: 'Recibida',
  IN_WORKSHOP: 'En taller',
  WAITING_PARTS: 'Esperando repuestos',
  READY: 'Lista para entrega',
}

export const WO_ALERT_ROWS: readonly { status: AlertPipelineStatus; description: string }[] = [
  { status: 'UNASSIGNED', description: 'En cola sin técnico asignado' },
  { status: 'RECEIVED', description: 'Recibida / flujo inicial' },
  { status: 'IN_WORKSHOP', description: 'Trabajo en taller' },
  { status: 'WAITING_PARTS', description: 'Esperando repuestos' },
  { status: 'READY', description: 'Lista para entregar al cliente' },
]

/** Estática de compatibilidad: mismos valores que las filas de alerta. */
export const ALERT_PIPELINE_STATUSES: readonly AlertPipelineStatus[] = WO_ALERT_ROWS.map((r) => r.status)

export function isAlertPipelineStatus(s: WorkOrderStatus): s is AlertPipelineStatus {
  return (ALERT_PIPELINE_STATUSES as readonly WorkOrderStatus[]).includes(s)
}
