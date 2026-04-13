import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import type { UpdateInventoryItemDto } from './dto/update-inventory-item.dto';

const unitBrief = { select: { id: true, slug: true, name: true } };

@Injectable()
export class InventoryItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list() {
    return this.prisma.inventoryItem.findMany({
      where: { isActive: true },
      orderBy: { sku: 'asc' },
      take: 500,
      include: { measurementUnit: unitBrief },
    });
  }

  async findOne(id: string) {
    const row = await this.prisma.inventoryItem.findUnique({
      where: { id },
      include: { measurementUnit: unitBrief },
    });
    if (!row) {
      throw new NotFoundException('Ítem de inventario no encontrado');
    }
    return row;
  }

  async create(
    actorUserId: string,
    dto: CreateInventoryItemDto,
    meta: { ip?: string; userAgent?: string },
  ) {
    const mu = await this.prisma.measurementUnit.findUnique({
      where: { slug: dto.measurementUnitSlug.trim().toLowerCase() },
    });
    if (!mu) {
      throw new NotFoundException('Unidad de medida no encontrada');
    }

    const initial = dto.initialQuantity ? new Prisma.Decimal(dto.initialQuantity) : new Prisma.Decimal(0);
    if (initial.lt(0)) {
      throw new BadRequestException('Cantidad inicial inválida');
    }

    const row = await this.prisma.inventoryItem.create({
      data: {
        sku: dto.sku.trim(),
        name: dto.name.trim(),
        measurementUnitId: mu.id,
        quantityOnHand: initial,
        averageCost: dto.averageCost ? new Prisma.Decimal(dto.averageCost) : null,
        trackStock: dto.trackStock ?? true,
      },
      include: { measurementUnit: unitBrief },
    });

    await this.audit.recordDomain({
      actorUserId,
      action: 'inventory_items.created',
      entityType: 'InventoryItem',
      entityId: row.id,
      previousPayload: null,
      nextPayload: { sku: row.sku, name: row.name },
      ipAddress: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    });

    return row;
  }

  async update(
    id: string,
    actorUserId: string,
    dto: UpdateInventoryItemDto,
    meta: { ip?: string; userAgent?: string },
  ) {
    const keys = Object.keys(dto).filter((k) => dto[k as keyof UpdateInventoryItemDto] !== undefined);
    if (keys.length === 0) {
      throw new BadRequestException('No hay campos para actualizar');
    }

    const before = await this.prisma.inventoryItem.findUnique({ where: { id } });
    if (!before) {
      throw new NotFoundException('Ítem de inventario no encontrado');
    }

    const row = await this.prisma.inventoryItem.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        averageCost:
          dto.averageCost === undefined
            ? undefined
            : dto.averageCost === null
              ? null
              : new Prisma.Decimal(dto.averageCost),
        trackStock: dto.trackStock,
        isActive: dto.isActive,
      },
      include: { measurementUnit: unitBrief },
    });

    await this.audit.recordDomain({
      actorUserId,
      action: 'inventory_items.updated',
      entityType: 'InventoryItem',
      entityId: id,
      previousPayload: { name: before.name, isActive: before.isActive },
      nextPayload: { name: row.name, isActive: row.isActive, fields: keys },
      ipAddress: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    });

    return row;
  }
}
