import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { JwtUserPayload } from '../auth/types/jwt-user.payload';
import { WorkOrdersService } from '../work-orders/work-orders.service';
import type { CreateVehicleDto } from './dto/create-vehicle.dto';
import type { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { normalizeVehiclePlate } from './vehicle-plate.util';

const customerBrief = { select: { id: true, displayName: true, primaryPhone: true } };
const userBrief = { select: { id: true, email: true, fullName: true, isActive: true } };

@Injectable()
export class VehiclesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly workOrders: WorkOrdersService,
  ) {}

  async create(
    actorUserId: string,
    dto: CreateVehicleDto,
    meta: { ip?: string; userAgent?: string },
  ) {
    const cust = await this.prisma.customer.findUnique({
      where: { id: dto.customerId },
      select: { id: true, isActive: true },
    });
    if (!cust || !cust.isActive) {
      throw new NotFoundException('Cliente no encontrado o inactivo');
    }

    const plateNorm = normalizeVehiclePlate(dto.plate);

    try {
      const row = await this.prisma.vehicle.create({
        data: {
          customerId: dto.customerId,
          plate: dto.plate.trim(),
          plateNorm,
          vin: dto.vin?.trim() ?? null,
          brand: dto.brand?.trim() ?? null,
          model: dto.model?.trim() ?? null,
          year: dto.year ?? null,
          color: dto.color?.trim() ?? null,
          notes: dto.notes?.trim() ?? null,
        },
        include: { customer: customerBrief },
      });
      await this.audit.recordDomain({
        actorUserId,
        action: 'vehicles.created',
        entityType: 'Vehicle',
        entityId: row.id,
        previousPayload: null,
        nextPayload: { plateNorm: row.plateNorm, customerId: row.customerId },
        ipAddress: meta.ip ?? null,
        userAgent: meta.userAgent ?? null,
      });
      return row;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Ya existe un vehículo con esa placa (normalizada)');
      }
      throw e;
    }
  }

  async findOne(id: string) {
    const row = await this.prisma.vehicle.findUnique({
      where: { id },
      include: { customer: customerBrief },
    });
    if (!row) {
      throw new NotFoundException('Vehículo no encontrado');
    }
    return row;
  }

  async update(
    id: string,
    actorUserId: string,
    dto: UpdateVehicleDto,
    meta: { ip?: string; userAgent?: string },
  ) {
    const keys = Object.keys(dto).filter((k) => dto[k as keyof UpdateVehicleDto] !== undefined);
    if (keys.length === 0) {
      throw new BadRequestException('No hay campos para actualizar');
    }

    const before = await this.prisma.vehicle.findUnique({ where: { id } });
    if (!before) {
      throw new NotFoundException('Vehículo no encontrado');
    }

    const plateNorm =
      dto.plate !== undefined ? normalizeVehiclePlate(dto.plate) : undefined;

    try {
      const row = await this.prisma.vehicle.update({
        where: { id },
        data: {
          plate: dto.plate !== undefined ? dto.plate.trim() : undefined,
          plateNorm,
          vin: dto.vin !== undefined ? dto.vin?.trim() ?? null : undefined,
          brand: dto.brand !== undefined ? dto.brand?.trim() ?? null : undefined,
          model: dto.model !== undefined ? dto.model?.trim() ?? null : undefined,
          year: dto.year,
          color: dto.color !== undefined ? dto.color?.trim() ?? null : undefined,
          notes: dto.notes !== undefined ? dto.notes?.trim() ?? null : undefined,
          isActive: dto.isActive,
        },
        include: { customer: customerBrief },
      });
      await this.audit.recordDomain({
        actorUserId,
        action: 'vehicles.updated',
        entityType: 'Vehicle',
        entityId: id,
        previousPayload: { plateNorm: before.plateNorm, isActive: before.isActive },
        nextPayload: { plateNorm: row.plateNorm, isActive: row.isActive },
        ipAddress: meta.ip ?? null,
        userAgent: meta.userAgent ?? null,
      });
      return row;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Ya existe un vehículo con esa placa (normalizada)');
      }
      throw e;
    }
  }

  /** Búsqueda por placa (o fragmento) para enlazar OT a vehículo/cliente existentes. */
  async search(q: string) {
    const raw = q.trim();
    if (raw.length < 2) {
      throw new BadRequestException('Escribí al menos 2 caracteres para buscar');
    }
    const norm = raw.toUpperCase().replace(/\s+/g, '');
    return this.prisma.vehicle.findMany({
      where: {
        isActive: true,
        OR: [{ plateNorm: { contains: norm } }, { plate: { contains: raw, mode: 'insensitive' } }],
      },
      orderBy: { plateNorm: 'asc' },
      take: 25,
      select: {
        id: true,
        plate: true,
        plateNorm: true,
        brand: true,
        model: true,
        year: true,
        customer: customerBrief,
      },
    });
  }

  /** Historial: órdenes de trabajo asociadas al vehículo (más recientes primero). */
  async listWorkOrders(vehicleId: string, actor: JwtUserPayload) {
    const v = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { id: true },
    });
    if (!v) {
      throw new NotFoundException('Vehículo no encontrado');
    }
    return this.prisma.workOrder.findMany({
      where: { vehicleId, ...this.workOrders.workOrderVisibilityWhere(actor) },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        createdBy: userBrief,
        assignedTo: userBrief,
        _count: { select: { payments: true } },
      },
    });
  }
}
