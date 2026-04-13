/**
 * Líneas de OT: repuesto (consume stock) o mano de obra (importe al cliente, sin inventario).
 */
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  InventoryMovementType,
  Prisma,
  WorkOrderLineType,
  WorkOrderStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { INVENTORY_REF_WORK_ORDER_LINE } from '../inventory/inventory.constants';
import type { CreateWorkOrderLineDto } from './dto/create-work-order-line.dto';
import type { UpdateWorkOrderLineDto } from './dto/update-work-order-line.dto';

const lineInclude = {
  inventoryItem: {
    include: { measurementUnit: { select: { id: true, slug: true, name: true } } },
  },
} as const;

@Injectable()
export class WorkOrderLinesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(workOrderId: string) {
    await this.assertWorkOrderExists(workOrderId);
    return this.prisma.workOrderLine.findMany({
      where: { workOrderId },
      orderBy: { sortOrder: 'asc' },
      include: lineInclude,
    });
  }

  /** Suma cantidad × precio (líneas sin precio cuentan 0). */
  async subtotal(workOrderId: string) {
    await this.assertWorkOrderExists(workOrderId);
    const lines = await this.prisma.workOrderLine.findMany({
      where: { workOrderId },
      select: { quantity: true, unitPrice: true },
    });
    let sum = new Prisma.Decimal(0);
    for (const ln of lines) {
      const up = ln.unitPrice ?? new Prisma.Decimal(0);
      sum = sum.plus(ln.quantity.mul(up));
    }
    return { workOrderId, lineCount: lines.length, subtotal: sum.toFixed(2) };
  }

  async create(
    workOrderId: string,
    actorUserId: string,
    dto: CreateWorkOrderLineDto,
    meta: { ip?: string; userAgent?: string },
  ) {
    if (dto.lineType === WorkOrderLineType.PART) {
      if (!dto.inventoryItemId) {
        throw new BadRequestException('La línea PART requiere inventoryItemId');
      }
    } else {
      if (!dto.description?.trim()) {
        throw new BadRequestException('La línea LABOR requiere descripción');
      }
      if (dto.inventoryItemId) {
        throw new BadRequestException('La línea LABOR no admite inventoryItemId');
      }
    }

    const qty = new Prisma.Decimal(dto.quantity);
    if (qty.lte(0)) {
      throw new BadRequestException('La cantidad debe ser mayor a cero');
    }

    const line = await this.prisma.$transaction(async (tx) => {
      await this.lockWorkOrder(tx, workOrderId);
      await this.assertWorkOrderEditable(tx, workOrderId);

      const sortOrder = await this.nextSortOrder(tx, workOrderId);

      if (dto.lineType === WorkOrderLineType.LABOR) {
        return tx.workOrderLine.create({
          data: {
            workOrderId,
            lineType: WorkOrderLineType.LABOR,
            sortOrder,
            inventoryItemId: null,
            description: dto.description!.trim(),
            quantity: qty,
            unitPrice: dto.unitPrice ? new Prisma.Decimal(dto.unitPrice) : null,
          },
          include: lineInclude,
        });
      }

      await tx.$executeRaw(
        Prisma.sql`SELECT id FROM "inventory_items" WHERE id = ${dto.inventoryItemId!} FOR UPDATE`,
      );
      const item = await tx.inventoryItem.findUnique({ where: { id: dto.inventoryItemId! } });
      if (!item || !item.isActive) {
        throw new NotFoundException('Ítem de inventario no encontrado');
      }
      if (!item.trackStock) {
        throw new BadRequestException('Este ítem no descuenta stock');
      }
      if (item.quantityOnHand.lt(qty)) {
        throw new BadRequestException('Stock insuficiente para la cantidad solicitada');
      }

      const created = await tx.workOrderLine.create({
        data: {
          workOrderId,
          lineType: WorkOrderLineType.PART,
          sortOrder,
          inventoryItemId: item.id,
          description: dto.description?.trim() ?? null,
          quantity: qty,
          unitPrice: dto.unitPrice ? new Prisma.Decimal(dto.unitPrice) : null,
        },
        include: lineInclude,
      });

      await tx.inventoryItem.update({
        where: { id: item.id },
        data: { quantityOnHand: item.quantityOnHand.minus(qty) },
      });

      await tx.inventoryMovement.create({
        data: {
          inventoryItemId: item.id,
          quantityChange: qty.neg(),
          movementType: InventoryMovementType.WORK_ORDER_CONSUMPTION,
          referenceType: INVENTORY_REF_WORK_ORDER_LINE,
          referenceId: created.id,
          createdById: actorUserId,
        },
      });

      return created;
    });

    await this.audit.recordDomain({
      actorUserId,
      action: 'work_order_lines.created',
      entityType: 'WorkOrderLine',
      entityId: line.id,
      previousPayload: null,
      nextPayload: { workOrderId, lineType: line.lineType, quantity: dto.quantity },
      ipAddress: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    });

    return line;
  }

  async update(
    workOrderId: string,
    lineId: string,
    actorUserId: string,
    dto: UpdateWorkOrderLineDto,
    meta: { ip?: string; userAgent?: string },
  ) {
    const keys = Object.keys(dto).filter((k) => dto[k as keyof UpdateWorkOrderLineDto] !== undefined);
    if (keys.length === 0) {
      throw new BadRequestException('No hay campos para actualizar');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await this.lockWorkOrder(tx, workOrderId);
      await this.assertWorkOrderEditable(tx, workOrderId);

      const before = await tx.workOrderLine.findFirst({
        where: { id: lineId, workOrderId },
        include: { inventoryItem: true },
      });
      if (!before) {
        throw new NotFoundException('Línea no encontrada en esta orden');
      }

      if (dto.quantity !== undefined) {
        const newQty = new Prisma.Decimal(dto.quantity);
        if (newQty.lte(0)) {
          throw new BadRequestException('La cantidad debe ser mayor a cero');
        }
        if (before.lineType === WorkOrderLineType.PART && before.inventoryItemId) {
          const delta = newQty.minus(before.quantity);
          if (!delta.eq(0)) {
            await tx.$executeRaw(
              Prisma.sql`SELECT id FROM "inventory_items" WHERE id = ${before.inventoryItemId} FOR UPDATE`,
            );
            const item = await tx.inventoryItem.findUniqueOrThrow({
              where: { id: before.inventoryItemId },
            });
            if (delta.gt(0) && item.quantityOnHand.lt(delta)) {
              throw new BadRequestException('Stock insuficiente para el incremento de cantidad');
            }
            await tx.inventoryItem.update({
              where: { id: item.id },
              data: { quantityOnHand: item.quantityOnHand.minus(delta) },
            });
            await tx.inventoryMovement.create({
              data: {
                inventoryItemId: item.id,
                quantityChange: delta.neg(),
                movementType: InventoryMovementType.WORK_ORDER_CONSUMPTION,
                referenceType: INVENTORY_REF_WORK_ORDER_LINE,
                referenceId: before.id,
                note: 'Ajuste por edición de cantidad en línea',
                createdById: actorUserId,
              },
            });
          }
        }
      }

      return tx.workOrderLine.update({
        where: { id: lineId },
        data: {
          quantity: dto.quantity !== undefined ? new Prisma.Decimal(dto.quantity) : undefined,
          unitPrice:
            dto.unitPrice === undefined
              ? undefined
              : dto.unitPrice === null
                ? null
                : new Prisma.Decimal(dto.unitPrice),
          description: dto.description !== undefined ? dto.description?.trim() ?? null : undefined,
        },
        include: lineInclude,
      });
    });

    await this.audit.recordDomain({
      actorUserId,
      action: 'work_order_lines.updated',
      entityType: 'WorkOrderLine',
      entityId: lineId,
      previousPayload: { workOrderId },
      nextPayload: { workOrderId, fields: keys },
      ipAddress: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    });

    return updated;
  }

  async remove(workOrderId: string, lineId: string, actorUserId: string, meta: { ip?: string; userAgent?: string }) {
    await this.prisma.$transaction(async (tx) => {
      await this.lockWorkOrder(tx, workOrderId);
      await this.assertWorkOrderEditable(tx, workOrderId);

      const line = await tx.workOrderLine.findFirst({
        where: { id: lineId, workOrderId },
      });
      if (!line) {
        throw new NotFoundException('Línea no encontrada en esta orden');
      }

      if (line.lineType === WorkOrderLineType.PART && line.inventoryItemId) {
        await tx.$executeRaw(
          Prisma.sql`SELECT id FROM "inventory_items" WHERE id = ${line.inventoryItemId} FOR UPDATE`,
        );
        const item = await tx.inventoryItem.findUniqueOrThrow({ where: { id: line.inventoryItemId } });
        await tx.inventoryItem.update({
          where: { id: item.id },
          data: { quantityOnHand: item.quantityOnHand.plus(line.quantity) },
        });
        await tx.inventoryMovement.create({
          data: {
            inventoryItemId: item.id,
            quantityChange: line.quantity,
            movementType: InventoryMovementType.ADJUSTMENT_IN,
            referenceType: INVENTORY_REF_WORK_ORDER_LINE,
            referenceId: line.id,
            note: 'Reversión por eliminación de línea de OT',
            createdById: actorUserId,
          },
        });
      }

      await tx.workOrderLine.delete({ where: { id: lineId } });
    });

    await this.audit.recordDomain({
      actorUserId,
      action: 'work_order_lines.deleted',
      entityType: 'WorkOrderLine',
      entityId: lineId,
      previousPayload: { workOrderId },
      nextPayload: null,
      ipAddress: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    });
  }

  private async assertWorkOrderExists(workOrderId: string): Promise<void> {
    const wo = await this.prisma.workOrder.findUnique({
      where: { id: workOrderId },
      select: { id: true },
    });
    if (!wo) {
      throw new NotFoundException('Orden de trabajo no encontrada');
    }
  }

  private async lockWorkOrder(tx: Prisma.TransactionClient, workOrderId: string): Promise<void> {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "work_orders" WHERE id = ${workOrderId} FOR UPDATE`);
  }

  private async assertWorkOrderEditable(tx: Prisma.TransactionClient, workOrderId: string): Promise<void> {
    const wo = await tx.workOrder.findUnique({
      where: { id: workOrderId },
      select: { status: true },
    });
    if (!wo) {
      throw new NotFoundException('Orden de trabajo no encontrada');
    }
    if (wo.status === WorkOrderStatus.DELIVERED || wo.status === WorkOrderStatus.CANCELLED) {
      throw new ConflictException('La orden está cerrada; no admite cambios en líneas');
    }
  }

  private async nextSortOrder(tx: Prisma.TransactionClient, workOrderId: string): Promise<number> {
    const agg = await tx.workOrderLine.aggregate({
      where: { workOrderId },
      _max: { sortOrder: true },
    });
    return (agg._max.sortOrder ?? -1) + 1;
  }
}
