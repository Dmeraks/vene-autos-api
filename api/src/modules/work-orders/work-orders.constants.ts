import { WorkOrderStatus } from '@prisma/client';

/**
 * Transiciones de estado permitidas (grafo dirigido). Estados terminales: DELIVERED, CANCELLED.
 */
export const WORK_ORDER_ALLOWED_TRANSITIONS: Readonly<
  Record<WorkOrderStatus, readonly WorkOrderStatus[]>
> = {
  [WorkOrderStatus.UNASSIGNED]: [
    WorkOrderStatus.RECEIVED,
    WorkOrderStatus.CANCELLED,
  ],
  [WorkOrderStatus.RECEIVED]: [
    WorkOrderStatus.UNASSIGNED,
    WorkOrderStatus.IN_WORKSHOP,
    WorkOrderStatus.WAITING_PARTS,
    WorkOrderStatus.CANCELLED,
  ],
  [WorkOrderStatus.IN_WORKSHOP]: [
    WorkOrderStatus.UNASSIGNED,
    WorkOrderStatus.WAITING_PARTS,
    WorkOrderStatus.READY,
    WorkOrderStatus.RECEIVED,
    WorkOrderStatus.CANCELLED,
  ],
  [WorkOrderStatus.WAITING_PARTS]: [
    WorkOrderStatus.UNASSIGNED,
    WorkOrderStatus.IN_WORKSHOP,
    WorkOrderStatus.READY,
    WorkOrderStatus.CANCELLED,
  ],
  [WorkOrderStatus.READY]: [
    WorkOrderStatus.UNASSIGNED,
    WorkOrderStatus.DELIVERED,
    WorkOrderStatus.IN_WORKSHOP,
    WorkOrderStatus.WAITING_PARTS,
    WorkOrderStatus.CANCELLED,
  ],
  [WorkOrderStatus.DELIVERED]: [],
  [WorkOrderStatus.CANCELLED]: [],
};
