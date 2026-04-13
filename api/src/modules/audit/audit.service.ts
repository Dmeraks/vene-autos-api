import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuditQueryDto } from './dto/audit-query.dto';

export interface DomainAuditInput {
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  previousPayload?: unknown;
  nextPayload?: unknown;
  reason?: string | null;
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async recordDomain(input: DomainAuditInput): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorUserId: input.actorUserId,
          action: input.action,
          entityType: input.entityType,
          entityId: input.entityId ?? null,
          previousPayload: toJsonValue(input.previousPayload),
          nextPayload: toJsonValue(input.nextPayload),
          reason: input.reason ?? null,
          requestId: input.requestId ?? null,
          ipAddress: input.ipAddress ?? null,
          userAgent: input.userAgent ?? null,
        },
      });
    } catch (err) {
      this.logger.error('Fallo al persistir auditoría', err as Error);
    }
  }

  async search(query: AuditQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const where: Prisma.AuditLogWhereInput = {};

    if (query.entityType) {
      where.entityType = query.entityType;
    }
    if (query.entityId) {
      where.entityId = query.entityId;
    }
    if (query.actorUserId) {
      where.actorUserId = query.actorUserId;
    }
    if (query.action) {
      where.action = { contains: query.action, mode: 'insensitive' };
    }
    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) {
        where.createdAt.gte = new Date(query.from);
      }
      if (query.to) {
        where.createdAt.lte = new Date(query.to);
      }
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          actor: { select: { id: true, email: true, fullName: true } },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      items,
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async recordHttpEvent(input: {
    actorUserId: string | null;
    method: string;
    path: string;
    statusCode: number;
    query: unknown;
    body: unknown;
    requestId?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
  }): Promise<void> {
    const action = `http.${input.method.toLowerCase()}`;
    await this.recordDomain({
      actorUserId: input.actorUserId,
      action,
      entityType: 'HTTP',
      entityId: null,
      previousPayload: null,
      nextPayload: {
        path: input.path,
        statusCode: input.statusCode,
        query: input.query,
        body: input.body,
      },
      requestId: input.requestId,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });
  }
}

function toJsonValue(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === undefined || value === null) {
    return Prisma.JsonNull;
  }
  return value as Prisma.InputJsonValue;
}
