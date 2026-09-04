import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { decimalFromMoneyApiString } from '../../common/money/cop-money';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { CreateServiceDto } from './dto/create-service.dto';
import type { UpdateServiceDto } from './dto/update-service.dto';

const serviceInclude = {
  defaultTaxRate: {
    select: { id: true, slug: true, name: true, kind: true, ratePercent: true, isActive: true },
  },
} as const;

/**
 * Catálogo de servicios del taller (mano de obra predefinida).
 * No afecta inventario. Los servicios desactivados no aparecen en selectores de OT/ventas
 * pero siguen disponibles para reportes históricos.
 */
@Injectable()
export class ServicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(params: { onlyActive: boolean }) {
    return this.prisma.service.findMany({
      where: params.onlyActive ? { isActive: true } : undefined,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: serviceInclude,
    });
  }

  async findOne(id: string) {
    const row = await this.prisma.service.findUnique({
      where: { id },
      include: serviceInclude,
    });
    if (!row) throw new NotFoundException('Servicio no encontrado');
    return row;
  }

  async create(
    actorUserId: string,
    dto: CreateServiceDto,
    meta: { ip?: string; userAgent?: string },
  ) {
    const code = dto.code.trim().toUpperCase();
    const duplicate = await this.prisma.service.findUnique({ where: { code } });
    if (duplicate) {
      throw new ConflictException('Ya existe un servicio con ese código');
    }

    if (dto.defaultTaxRateId) {
      const tax = await this.prisma.taxRate.findUnique({ where: { id: dto.defaultTaxRateId } });
      if (!tax) throw new NotFoundException('Tarifa de impuesto sugerida no encontrada');
      if (!tax.isActive) {
        throw new BadRequestException('La tarifa de impuesto sugerida está desactivada');
      }
    }

    const row = await this.prisma.service.create({
      data: {
        code,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        defaultUnitPrice: dto.defaultUnitPrice ? decimalFromMoneyApiString(dto.defaultUnitPrice) : null,
        defaultTaxRateId: dto.defaultTaxRateId ?? null,
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? 0,
      },
      include: serviceInclude,
    });

    await this.audit.recordDomain({
      actorUserId,
      action: 'services.created',
      entityType: 'Service',
      entityId: row.id,
      previousPayload: null,
      nextPayload: { code: row.code, name: row.name },
      ipAddress: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    });

    return row;
  }

  async update(
    id: string,
    actorUserId: string,
    dto: UpdateServiceDto,
    meta: { ip?: string; userAgent?: string },
  ) {
    const before = await this.prisma.service.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Servicio no encontrado');

    const keys = Object.keys(dto).filter((k) => dto[k as keyof UpdateServiceDto] !== undefined);
    if (keys.length === 0) {
      throw new BadRequestException('No hay campos para actualizar');
    }

    if (dto.defaultTaxRateId !== undefined && dto.defaultTaxRateId !== null) {
      const tax = await this.prisma.taxRate.findUnique({ where: { id: dto.defaultTaxRateId } });
      if (!tax) throw new NotFoundException('Tarifa de impuesto sugerida no encontrada');
    }

    const row = await this.prisma.service.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        description:
          dto.description === undefined
            ? undefined
            : dto.description === null
              ? null
              : dto.description.trim() || null,
        defaultUnitPrice:
          dto.defaultUnitPrice === undefined
            ? undefined
            : dto.defaultUnitPrice === null
              ? null
              : decimalFromMoneyApiString(dto.defaultUnitPrice),
        defaultTaxRateId: dto.defaultTaxRateId,
        isActive: dto.isActive,
        sortOrder: dto.sortOrder,
      },
      include: serviceInclude,
    });

    await this.audit.recordDomain({
      actorUserId,
      action: 'services.updated',
      entityType: 'Service',
      entityId: id,
      previousPayload: { name: before.name, isActive: before.isActive },
      nextPayload: { name: row.name, isActive: row.isActive, fields: keys },
      ipAddress: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    });

    return row;
  }
}
