import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { CreateTaxRateDto } from './dto/create-tax-rate.dto';
import type { UpdateTaxRateDto } from './dto/update-tax-rate.dto';

/**
 * Catálogo de impuestos indirectos (IVA/INC). El taller NO borra filas aquí: desactiva
 * para preservar trazabilidad fiscal y referencias desde OT antiguas.
 */
@Injectable()
export class TaxRatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(params: { onlyActive: boolean }) {
    return this.prisma.taxRate.findMany({
      where: params.onlyActive ? { isActive: true } : undefined,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async findOne(id: string) {
    const row = await this.prisma.taxRate.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Tarifa de impuesto no encontrada');
    return row;
  }

  async create(
    actorUserId: string,
    dto: CreateTaxRateDto,
    meta: { ip?: string; userAgent?: string },
  ) {
    const slug = dto.slug.trim().toLowerCase();
    const ratePercent = new Prisma.Decimal(dto.ratePercent);
    if (ratePercent.lt(0) || ratePercent.gt(100)) {
      throw new BadRequestException('El porcentaje debe estar entre 0 y 100.');
    }

    const existing = await this.prisma.taxRate.findUnique({ where: { slug } });
    if (existing) {
      throw new ConflictException('Ya existe una tarifa con ese identificador (slug).');
    }

    const row = await this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.taxRate.updateMany({
          where: { kind: dto.kind, isDefault: true },
          data: { isDefault: false },
        });
      }
      return tx.taxRate.create({
        data: {
          slug,
          name: dto.name.trim(),
          kind: dto.kind,
          ratePercent,
          isActive: dto.isActive ?? true,
          isDefault: dto.isDefault ?? false,
          sortOrder: dto.sortOrder ?? 0,
        },
      });
    });

    await this.audit.recordDomain({
      actorUserId,
      action: 'tax_rates.created',
      entityType: 'TaxRate',
      entityId: row.id,
      previousPayload: null,
      nextPayload: {
        slug: row.slug,
        name: row.name,
        kind: row.kind,
        ratePercent: row.ratePercent.toString(),
      },
      ipAddress: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    });

    return row;
  }

  async update(
    id: string,
    actorUserId: string,
    dto: UpdateTaxRateDto,
    meta: { ip?: string; userAgent?: string },
  ) {
    const before = await this.prisma.taxRate.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Tarifa de impuesto no encontrada');

    const keys = Object.keys(dto).filter((k) => dto[k as keyof UpdateTaxRateDto] !== undefined);
    if (keys.length === 0) {
      throw new BadRequestException('No hay campos para actualizar');
    }

    let ratePercent: Prisma.Decimal | undefined;
    if (dto.ratePercent !== undefined) {
      ratePercent = new Prisma.Decimal(dto.ratePercent);
      if (ratePercent.lt(0) || ratePercent.gt(100)) {
        throw new BadRequestException('El porcentaje debe estar entre 0 y 100.');
      }
    }

    const row = await this.prisma.$transaction(async (tx) => {
      if (dto.isDefault === true) {
        await tx.taxRate.updateMany({
          where: { kind: before.kind, isDefault: true, NOT: { id } },
          data: { isDefault: false },
        });
      }
      return tx.taxRate.update({
        where: { id },
        data: {
          name: dto.name?.trim(),
          ratePercent,
          isActive: dto.isActive,
          isDefault: dto.isDefault,
          sortOrder: dto.sortOrder,
        },
      });
    });

    await this.audit.recordDomain({
      actorUserId,
      action: 'tax_rates.updated',
      entityType: 'TaxRate',
      entityId: id,
      previousPayload: {
        name: before.name,
        ratePercent: before.ratePercent.toString(),
        isActive: before.isActive,
        isDefault: before.isDefault,
      },
      nextPayload: {
        name: row.name,
        ratePercent: row.ratePercent.toString(),
        isActive: row.isActive,
        isDefault: row.isDefault,
        fields: keys,
      },
      ipAddress: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    });

    return row;
  }
}
