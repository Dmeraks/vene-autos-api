import { WorkOrderStatus } from '@prisma/client';

/**
 * Transiciones de estado permitidas (grafo dirigido). Estados terminales: DELIVERED, CANCELLED.
 */
export const WORK_ORDER_ALLOWED_TRANSITIONS: Readonly<
  Record<WorkOrderStatus, readonly WorkOrderStatus[]>
> = {
  [WorkOrderStatus.RECEIVED]: [
    WorkOrderStatus.IN_WORKSHOP,
    WorkOrderStatus.WAITING_PARTS,
    WorkOrderStatus.CANCELLED,
  ],
  [WorkOrderStatus.IN_WORKSHOP]: [
    WorkOrderStatus.WAITING_PARTS,
    WorkOrderStatus.READY,
    WorkOrderStatus.RECEIVED,
    WorkOrderStatus.CANCELLED,
  ],
  [WorkOrderStatus.WAITING_PARTS]: [
    WorkOrderStatus.IN_WORKSHOP,
    WorkOrderStatus.READY,
    WorkOrderStatus.CANCELLED,
  ],
  [WorkOrderStatus.READY]: [
    WorkOrderStatus.DELIVERED,
    WorkOrderStatus.IN_WORKSHOP,
    WorkOrderStatus.WAITING_PARTS,
    WorkOrderStatus.CANCELLED,
  ],
  [WorkOrderStatus.DELIVERED]: [],
  [WorkOrderStatus.CANCELLED]: [],
};
