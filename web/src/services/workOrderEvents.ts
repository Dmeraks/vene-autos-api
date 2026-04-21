/** Evento para refrescar listados u otras vistas cuando una OT muta (misma pestaña u otras del mismo origen). */
export const WORK_ORDER_CHANGED_EVENT = 'vene:work-order-changed'

export type WorkOrderChangedDetail = { workOrderId: string }

export function emitWorkOrderChanged(workOrderId: string): void {
  window.dispatchEvent(
    new CustomEvent<WorkOrderChangedDetail>(WORK_ORDER_CHANGED_EVENT, {
      detail: { workOrderId },
    }),
  )
}
