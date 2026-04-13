/**
 * Órdenes de trabajo (Fase 3): unidad operativa del taller antes de cobros/inventario formales.
 */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, WorkOrderStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { WORK_ORDER_ALLOWED_TRANSITIONS } from './work-orders.constants';
import type { CreateWorkOrderDto } from './dto/create-work-order.dto';
import type { ListWorkOrdersQueryDto } from './dto/list-work-orders.query.dto';
import type { UpdateWorkOrderDto } from './dto/update-work-order.dto';

const LIST_TAKE = 50;

const userBrief = { select: { id: true, email: true, fullName: true, isActive: true } };

const vehicleWithCustomer = {
  include: {
    customer: { select: { id: true, displayName: true, primaryPhone: true, documentId: true } },
  },
};

const workOrderLineInclude = {
  inventoryItem: {
    include: { measurementUnit: { select: { id: true, slug: true, name: true } } },
  },
} as const;

@Injectable()
export class WorkOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(
    actorUserId: string,
    dto: CreateWorkOrderDto,
    meta: { ip?: string; userAgent?: string },
  ) {
    if (dto.assignedToId) {
      await this.assertAssignableUser(dto.assignedToId);
    }

    const data: Prisma.WorkOrderCreateInput = {
      description: dto.description.trim(),
      customerName: dto.customerName?.trim() ?? null,
      customerPhone: dto.customerPhone?.trim() ?? null,
      vehiclePlate: dto.vehiclePlate?.trim() ?? null,
      vehicleNotes: dto.vehicleNotes?.trim() ?? null,
      internalNotes: dto.internalNotes?.trim() ?? null,
      authorizedAmount: dto.authorizedAmount
        ? new Prisma.Decimal(dto.authorizedAmount)
        : undefined,
      status: WorkOrderStatus.RECEIVED,
      createdBy: { connect: { id: actorUserId } },
    };
    if (dto.assignedToId) {
      data.assignedTo = { connect: { id: dto.assignedToId } };
    }

    if (dto.vehicleId) {
      const v = await this.prisma.vehicle.findUnique({
        where: { id: dto.vehicleId },
        include: { customer: true },
      });
      if (!v || !v.isActive) {
        throw new NotFoundException('Vehículo no encontrado o inactivo');
      }
      data.vehicle = { connect: { id: v.id } };
      data.customerName = dto.customerName?.trim() ?? v.customer.displayName;
      data.customerPhone = dto.customerPhone?.trim() ?? v.customer.primaryPhone ?? null;
      data.vehiclePlate = dto.vehiclePlate?.trim() ?? v.plate;
      if (dto.vehicleNotes?.trim()) {
        data.vehicleNotes = dto.vehicleNotes.trim();
      } else if (v.notes) {
        data.vehicleNotes = v.notes;
      }
    }

    const row = await this.prisma.workOrder.create({
      data,
      include: {
        createdBy: userBrief,
        assignedTo: userBrief,
        vehicle: vehicleWithCustomer,
      },
    });

    await this.audit.recordDomain({
      actorUserId,
      action: 'work_orders.created',
      entityType: 'WorkOrder',
      entityId: row.id,
      previousPayload: null,
      nextPayload: {
        orderNumber: row.orderNumber,
        status: row.status,
        description: row.description,
        authorizedAmount: row.authorizedAmount?.toString() ?? null,
        vehicleId: row.vehicleId,
      },
      ipAddress: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    });

    return row;
  }

  async list(_actorUserId: string, query: ListWorkOrdersQueryDto) {
    const where: Prisma.WorkOrderWhereInput = {};
    if (query.status) {
      where.status = query.status;
    }
    if (query.vehicleId) {
      where.vehicleId = query.vehicleId;
    }
    return this.prisma.workOrder.findMany({
      where,
      take: LIST_TAKE,
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: userBrief,
        assignedTo: userBrief,
        vehicle: vehicleWithCustomer,
      },
    });
  }

  async findOne(id: string) {
    const row = await this.prisma.workOrder.findUnique({
      where: { id },
      include: {
        createdBy: userBrief,
        assignedTo: userBrief,
        vehicle: vehicleWithCustomer,
        lines: { orderBy: { sortOrder: 'asc' }, include: workOrderLineInclude },
        _count: { select: { payments: true } },
      },
    });
    if (!row) {
      throw new NotFoundException('Orden de trabajo no encontrada');
    }

    const paid = await this.prisma.workOrderPayment.aggregate({
      where: { workOrderId: id },
      _sum: { amount: true },
    });
    const totalPaid = paid._sum.amount ?? new Prisma.Decimal(0);
    const remaining =
      row.authorizedAmount != null
        ? row.authorizedAmount.minus(totalPaid).toFixed(2)
        : null;

    let linesSubtotal = new Prisma.Decimal(0);
    const lineRows = row.lines ?? [];
    for (const ln of lineRows) {
      const up = ln.unitPrice ?? new Prisma.Decimal(0);
      linesSubtotal = linesSubtotal.plus(ln.quantity.mul(up));
    }

    const { _count, ...rest } = row;
    return {
      ...rest,
      linesSubtotal: linesSubtotal.toFixed(2),
      paymentSummary: {
        paymentCount: _count.payments,
        totalPaid: totalPaid.toString(),
        remaining,
      },
    };
  }

  async update(
    id: string,
    actorUserId: string,
    dto: UpdateWorkOrderDto,
    meta: { ip?: string; userAgent?: string },
  ) {
    const keys = Object.keys(dto).filter((k) => dto[k as keyof UpdateWorkOrderDto] !== undefined);
    if (keys.length === 0) {
      throw new BadRequestException('No hay campos para actualizar');
    }

    const before = await this.prisma.workOrder.findUnique({ where: { id } });
    if (!before) {
      throw new NotFoundException('Orden de trabajo no encontrada');
    }

    if (
      before.status === WorkOrderStatus.DELIVERED ||
      before.status === WorkOrderStatus.CANCELLED
    ) {
      throw new ConflictException('La orden está cerrada; no admite cambios');
    }

    if (dto.assignedToId !== undefined && dto.assignedToId !== null) {
      await this.assertAssignableUser(dto.assignedToId);
    }

    if (dto.authorizedAmount !== undefined && dto.authorizedAmount !== null) {
      const cap = new Prisma.Decimal(dto.authorizedAmount);
      const paid = await this.prisma.workOrderPayment.aggregate({
        where: { workOrderId: id },
        _sum: { amount: true },
      });
      const totalPaid = paid._sum.amount ?? new Prisma.Decimal(0);
      if (cap.lt(totalPaid)) {
        throw new BadRequestException(
          'El monto autorizado no puede ser menor al total ya cobrado en esta orden',
        );
      }
    }

    if (dto.status !== undefined && dto.status !== before.status) {
      if (!this.canTransition(before.status, dto.status)) {
        throw new BadRequestException(
          `Transición de estado no permitida: ${before.status} → ${dto.status}`,
        );
      }
    }

    const data: Prisma.WorkOrderUpdateInput = {};
    if (dto.description !== undefined) {
      data.description = dto.description.trim();
    }
    if (dto.customerName !== undefined) {
      data.customerName = dto.customerName?.trim() ?? null;
    }
    if (dto.customerPhone !== undefined) {
      data.customerPhone = dto.customerPhone?.trim() ?? null;
    }
    if (dto.vehiclePlate !== undefined) {
      data.vehiclePlate = dto.vehiclePlate?.trim() ?? null;
    }
    if (dto.vehicleNotes !== undefined) {
      data.vehicleNotes = dto.vehicleNotes?.trim() ?? null;
    }
    if (dto.internalNotes !== undefined) {
      data.internalNotes = dto.internalNotes?.trim() ?? null;
    }
    if (dto.authorizedAmount !== undefined) {
      data.authorizedAmount =
        dto.authorizedAmount === null ? null : new Prisma.Decimal(dto.authorizedAmount);
    }
    if (dto.assignedToId !== undefined) {
      data.assignedTo = dto.assignedToId
        ? { connect: { id: dto.assignedToId } }
        : { disconnect: true };
    }

    if (dto.vehicleId !== undefined) {
      if (dto.vehicleId === null) {
        data.vehicle = { disconnect: true };
      } else {
        const v = await this.prisma.vehicle.findUnique({
          where: { id: dto.vehicleId },
          include: { customer: true },
        });
        if (!v || !v.isActive) {
          throw new NotFoundException('Vehículo no encontrado o inactivo');
        }
        data.vehicle = { connect: { id: v.id } };
        if (dto.customerName === undefined) {
          data.customerName = v.customer.displayName;
        }
        if (dto.customerPhone === undefined) {
          data.customerPhone = v.customer.primaryPhone;
        }
        if (dto.vehiclePlate === undefined) {
          data.vehiclePlate = v.plate;
        }
      }
    }

    if (dto.status !== undefined) {
      data.status = dto.status;
      if (dto.status === WorkOrderStatus.DELIVERED) {
        data.deliveredAt = new Date();
      } else if (before.deliveredAt) {
        data.deliveredAt = null;
      }
    }

    const row = await this.prisma.workOrder.update({
      where: { id },
      data,
      include: {
        createdBy: userBrief,
        assignedTo: userBrief,
        vehicle: vehicleWithCustomer,
      },
    });

    await this.audit.recordDomain({
      actorUserId,
      action: 'work_orders.updated',
      entityType: 'WorkOrder',
      entityId: id,
      previousPayload: {
        status: before.status,
        orderNumber: before.orderNumber,
        assignedToId: before.assignedToId,
        authorizedAmount: before.authorizedAmount?.toString() ?? null,
        vehicleId: before.vehicleId,
      },
      nextPayload: {
        status: row.status,
        orderNumber: row.orderNumber,
        assignedToId: row.assignedToId,
        authorizedAmount: row.authorizedAmount?.toString() ?? null,
        vehicleId: row.vehicleId,
        fields: keys,
      },
      ipAddress: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    });

    return row;
  }

  private canTransition(from: WorkOrderStatus, to: WorkOrderStatus): boolean {
    const allowed = WORK_ORDER_ALLOWED_TRANSITIONS[from];
    return (allowed as readonly WorkOrderStatus[]).includes(to);
  }

  private async assertAssignableUser(userId: string): Promise<void> {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isActive: true },
    });
    if (!u || !u.isActive) {
      throw new ForbiddenException('Usuario asignado inválido o inactivo');
    }
  }
}
