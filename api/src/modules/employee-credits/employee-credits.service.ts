import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateEmployeeCreditLineDto } from './dto/create-employee-credit-line.dto';
import { UpdateEmployeeCreditLineDto } from './dto/update-employee-credit-line.dto';

function moneyToDecimal(raw: string): Prisma.Decimal {
  const d = new Prisma.Decimal(raw);
  if (d.lte(0)) {
    throw new BadRequestException('El monto debe ser mayor a cero.');
  }
  return d;
}

@Injectable()
export class EmployeeCreditsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listDebtorCandidates() {
    const rows = await this.prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, fullName: true },
      orderBy: { fullName: 'asc' },
    });
    return rows;
  }

  async summary() {
    const grouped = await this.prisma.employeeCreditLine.groupBy({
      by: ['debtorUserId'],
      where: { voidedAt: null },
      _sum: { amount: true },
      _count: { _all: true },
    });
    if (!grouped.length) return [];

    const debtorIds = grouped.map((g) => g.debtorUserId);
    const users = await this.prisma.user.findMany({
      where: { id: { in: debtorIds } },
      select: { id: true, fullName: true },
    });
    const nameById = new Map(users.map((u) => [u.id, u.fullName]));

    return grouped
      .map((g) => ({
        debtorUserId: g.debtorUserId,
        fullName: nameById.get(g.debtorUserId) ?? '—',
        lineCount: g._count._all,
        totalAmount: (g._sum.amount ?? new Prisma.Decimal(0)).toFixed(0),
      }))
      .sort((a, b) => a.fullName.localeCompare(b.fullName, 'es'));
  }

  async listLines(debtorUserId: string) {
    const debtor = await this.prisma.user.findFirst({
      where: { id: debtorUserId, isActive: true },
      select: { id: true, fullName: true },
    });
    if (!debtor) throw new NotFoundException('Empleado no encontrado o inactivo.');

    const lines = await this.prisma.employeeCreditLine.findMany({
      where: { debtorUserId, voidedAt: null },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        description: true,
        amount: true,
        createdAt: true,
        updatedAt: true,
        createdBy: { select: { id: true, fullName: true } },
      },
    });

    return {
      debtorUserId: debtor.id,
      debtorFullName: debtor.fullName,
      lines: lines.map((row) => ({
        id: row.id,
        description: row.description,
        amount: row.amount.toFixed(0),
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        createdBy: row.createdBy,
      })),
    };
  }

  async createLine(actorUserId: string, dto: CreateEmployeeCreditLineDto, req: Pick<Request, 'ip'> & { headers: Request['headers'] }) {
    const debtor = await this.prisma.user.findFirst({
      where: { id: dto.debtorUserId, isActive: true },
      select: { id: true },
    });
    if (!debtor) throw new NotFoundException('Empleado no encontrado o inactivo.');

    const amount = moneyToDecimal(dto.amount);
    const row = await this.prisma.employeeCreditLine.create({
      data: {
        debtorUserId: dto.debtorUserId,
        description: dto.description.trim(),
        amount,
        createdById: actorUserId,
      },
      select: { id: true },
    });

    await this.audit.recordDomain({
      actorUserId: actorUserId,
      action: 'employee_credit_line.created',
      entityType: 'EmployeeCreditLine',
      entityId: row.id,
      nextPayload: { debtorUserId: dto.debtorUserId, amount: dto.amount, description: dto.description },
      ipAddress: typeof req.ip === 'string' ? req.ip : null,
      userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
    });

    return row;
  }

  async updateLine(actorUserId: string, lineId: string, dto: UpdateEmployeeCreditLineDto, req: Pick<Request, 'ip'> & { headers: Request['headers'] }) {
    const existing = await this.prisma.employeeCreditLine.findFirst({
      where: { id: lineId, voidedAt: null },
    });
    if (!existing) throw new NotFoundException('Línea no encontrada o anulada.');

    if (dto.description == null && dto.amount == null) {
      throw new BadRequestException('Indicá descripción o monto a actualizar.');
    }

    const data: Prisma.EmployeeCreditLineUpdateInput = {};
    if (dto.description != null) data.description = dto.description.trim();
    if (dto.amount != null) data.amount = moneyToDecimal(dto.amount);

    const updated = await this.prisma.employeeCreditLine.update({
      where: { id: lineId },
      data,
      select: { id: true, debtorUserId: true, description: true, amount: true },
    });

    await this.audit.recordDomain({
      actorUserId: actorUserId,
      action: 'employee_credit_line.updated',
      entityType: 'EmployeeCreditLine',
      entityId: lineId,
      previousPayload: {
        description: existing.description,
        amount: existing.amount.toFixed(0),
      },
      nextPayload: {
        description: updated.description,
        amount: updated.amount.toFixed(0),
      },
      ipAddress: typeof req.ip === 'string' ? req.ip : null,
      userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
    });

    return { id: updated.id };
  }

  async voidLine(actorUserId: string, lineId: string, req: Pick<Request, 'ip'> & { headers: Request['headers'] }) {
    const existing = await this.prisma.employeeCreditLine.findFirst({
      where: { id: lineId, voidedAt: null },
      select: { id: true, debtorUserId: true, description: true, amount: true },
    });
    if (!existing) throw new NotFoundException('Línea no encontrada o ya anulada.');

    await this.prisma.employeeCreditLine.update({
      where: { id: lineId },
      data: { voidedAt: new Date() },
    });

    await this.audit.recordDomain({
      actorUserId: actorUserId,
      action: 'employee_credit_line.voided',
      entityType: 'EmployeeCreditLine',
      entityId: lineId,
      previousPayload: {
        debtorUserId: existing.debtorUserId,
        description: existing.description,
        amount: existing.amount.toFixed(0),
      },
      ipAddress: typeof req.ip === 'string' ? req.ip : null,
      userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
    });

    return { ok: true as const };
  }
}
