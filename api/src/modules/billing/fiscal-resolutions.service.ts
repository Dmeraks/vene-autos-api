import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FiscalResolutionKind, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { JwtUserPayload } from '../auth/types/jwt-user.payload';
import { AUDIT_FISCAL_RESOLUTION_ENTITY } from './billing.constants';
import type { CreateFiscalResolutionDto } from './dto/create-fiscal-resolution.dto';
import type { UpdateFiscalResolutionDto } from './dto/update-fiscal-resolution.dto';

const resolutionSelect = {
  id: true,
  kind: true,
  resolutionNumber: true,
  prefix: true,
  rangeFrom: true,
  rangeTo: true,
  nextNumber: true,
  validFrom: true,
  validUntil: true,
  technicalKey: true,
  testSetId: true,
  isActive: true,
  isDefault: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { id: true, email: true, fullName: true } },
} as const;

type SerializedResolution = ReturnType<FiscalResolutionsService['serialize']>;

@Injectable()
export class FiscalResolutionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<SerializedResolution[]> {
    const rows = await this.prisma.fiscalResolution.findMany({
      orderBy: [{ isActive: 'desc' }, { kind: 'asc' }, { prefix: 'asc' }],
      select: resolutionSelect,
    });
    return rows.map((r) => this.serialize(r));
  }

  async findOne(id: string): Promise<SerializedResolution> {
    const row = await this.prisma.fiscalResolution.findUnique({
      where: { id },
      select: resolutionSelect,
    });
    if (!row) throw new NotFoundException('Resolución fiscal no encontrada.');
    return this.serialize(row);
  }

  async create(
    actor: JwtUserPayload,
    dto: CreateFiscalResolutionDto,
    meta: { ip?: string; userAgent?: string },
  ): Promise<SerializedResolution> {
    if (dto.rangeTo < dto.rangeFrom) {
      throw new BadRequestException('rangeTo debe ser mayor o igual que rangeFrom.');
    }
    const nextNumber = dto.nextNumber ?? dto.rangeFrom;
    if (nextNumber < dto.rangeFrom || nextNumber > dto.rangeTo + 1) {
      throw new BadRequestException(
        'nextNumber debe estar entre rangeFrom y rangeTo+1 (rangeTo+1 = agotada).',
      );
    }
    this.assertDateRange(dto.validFrom, dto.validUntil);

    const created = await this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.fiscalResolution.updateMany({
          where: { kind: dto.kind, isDefault: true, isActive: true },
          data: { isDefault: false },
        });
      }
      const row = await tx.fiscalResolution.create({
        data: {
          kind: dto.kind,
          resolutionNumber: dto.resolutionNumber.trim(),
          prefix: dto.prefix.trim().toUpperCase(),
          rangeFrom: dto.rangeFrom,
          rangeTo: dto.rangeTo,
          nextNumber,
          validFrom: dto.validFrom ? new Date(`${dto.validFrom}T00:00:00Z`) : null,
          validUntil: dto.validUntil ? new Date(`${dto.validUntil}T00:00:00Z`) : null,
          technicalKey: dto.technicalKey?.trim() || null,
          testSetId: dto.testSetId?.trim() || null,
          isDefault: Boolean(dto.isDefault),
          notes: dto.notes?.trim() || null,
          createdById: actor.sub,
        },
        select: resolutionSelect,
      });
      return row;
    });

    await this.audit.recordDomain({
      actorUserId: actor.sub,
      action: 'fiscal_resolutions.create',
      entityType: AUDIT_FISCAL_RESOLUTION_ENTITY,
      entityId: created.id,
      previousPayload: null,
      nextPayload: {
        kind: created.kind,
        prefix: created.prefix,
        rangeFrom: created.rangeFrom,
        rangeTo: created.rangeTo,
      },
      ipAddress: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    });
    return this.serialize(created);
  }

  async update(
    id: string,
    actor: JwtUserPayload,
    dto: UpdateFiscalResolutionDto,
    meta: { ip?: string; userAgent?: string },
  ): Promise<SerializedResolution> {
    const current = await this.prisma.fiscalResolution.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Resolución fiscal no encontrada.');

    const newFrom = dto.rangeFrom ?? current.rangeFrom;
    const newTo = dto.rangeTo ?? current.rangeTo;
    if (newTo < newFrom) {
      throw new BadRequestException('rangeTo debe ser mayor o igual que rangeFrom.');
    }
    const newNext = dto.nextNumber ?? current.nextNumber;
    if (newNext < current.nextNumber) {
      throw new BadRequestException(
        'nextNumber no puede retroceder (evita duplicar numeración ya emitida).',
      );
    }
    if (newNext < newFrom || newNext > newTo + 1) {
      throw new BadRequestException('nextNumber debe estar dentro de [rangeFrom, rangeTo+1].');
    }
    if (dto.validFrom != null || dto.validUntil != null) {
      const from = dto.validFrom ?? toYMD(current.validFrom);
      const until = dto.validUntil ?? toYMD(current.validUntil);
      this.assertDateRange(from, until);
    }

    const previousSnapshot = this.serialize({
      ...current,
      createdBy: null,
    });

    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.isDefault === true) {
        await tx.fiscalResolution.updateMany({
          where: {
            kind: current.kind,
            isDefault: true,
            isActive: true,
            NOT: { id: current.id },
          },
          data: { isDefault: false },
        });
      }
      const data: Prisma.FiscalResolutionUpdateInput = {};
      if (dto.resolutionNumber !== undefined)
        data.resolutionNumber = dto.resolutionNumber.trim();
      if (dto.prefix !== undefined) data.prefix = dto.prefix.trim().toUpperCase();
      if (dto.rangeFrom !== undefined) data.rangeFrom = dto.rangeFrom;
      if (dto.rangeTo !== undefined) data.rangeTo = dto.rangeTo;
      if (dto.nextNumber !== undefined) data.nextNumber = dto.nextNumber;
      if (dto.validFrom !== undefined)
        data.validFrom = dto.validFrom ? new Date(`${dto.validFrom}T00:00:00Z`) : null;
      if (dto.validUntil !== undefined)
        data.validUntil = dto.validUntil ? new Date(`${dto.validUntil}T00:00:00Z`) : null;
      if (dto.technicalKey !== undefined)
        data.technicalKey = dto.technicalKey?.trim() || null;
      if (dto.testSetId !== undefined) data.testSetId = dto.testSetId?.trim() || null;
      if (dto.isDefault !== undefined) data.isDefault = dto.isDefault;
      if (dto.isActive !== undefined) data.isActive = dto.isActive;
      if (dto.notes !== undefined) data.notes = dto.notes?.trim() || null;

      return tx.fiscalResolution.update({
        where: { id },
        data,
        select: resolutionSelect,
      });
    });

    await this.audit.recordDomain({
      actorUserId: actor.sub,
      action: 'fiscal_resolutions.update',
      entityType: AUDIT_FISCAL_RESOLUTION_ENTITY,
      entityId: updated.id,
      previousPayload: previousSnapshot as unknown as Record<string, unknown>,
      nextPayload: this.serialize(updated) as unknown as Record<string, unknown>,
      ipAddress: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    });

    return this.serialize(updated);
  }

  /** Solo se puede desactivar; nunca borrar (hay facturas que referencian). */
  async deactivate(
    id: string,
    actor: JwtUserPayload,
    meta: { ip?: string; userAgent?: string },
  ): Promise<SerializedResolution> {
    return this.update(id, actor, { isActive: false, isDefault: false }, meta);
  }

  private assertDateRange(from?: string | null, until?: string | null) {
    if (from && until && from > until) {
      throw new BadRequestException('validFrom debe ser anterior o igual a validUntil.');
    }
  }

  private serialize(row: {
    id: string;
    kind: FiscalResolutionKind;
    resolutionNumber: string;
    prefix: string;
    rangeFrom: number;
    rangeTo: number;
    nextNumber: number;
    validFrom: Date | null;
    validUntil: Date | null;
    technicalKey: string | null;
    testSetId: string | null;
    isActive: boolean;
    isDefault: boolean;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
    createdBy?: { id: string; email: string; fullName: string } | null;
  }) {
    return {
      id: row.id,
      kind: row.kind,
      resolutionNumber: row.resolutionNumber,
      prefix: row.prefix,
      rangeFrom: row.rangeFrom,
      rangeTo: row.rangeTo,
      nextNumber: row.nextNumber,
      consumedCount: row.nextNumber - row.rangeFrom,
      remainingCount: Math.max(0, row.rangeTo + 1 - row.nextNumber),
      exhausted: row.nextNumber > row.rangeTo,
      validFrom: toYMD(row.validFrom),
      validUntil: toYMD(row.validUntil),
      technicalKey: row.technicalKey,
      testSetId: row.testSetId,
      isActive: row.isActive,
      isDefault: row.isDefault,
      notes: row.notes,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      createdBy: row.createdBy ?? null,
    };
  }
}

function toYMD(date: Date | null): string | null {
  if (!date) return null;
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
