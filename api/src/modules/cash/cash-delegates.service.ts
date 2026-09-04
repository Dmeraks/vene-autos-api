/**
 * Delegados de egreso en caja (Fase 2).
 *
 * Política Vene Autos: además de dueño/administrador, hasta MAX_CASH_EXPENSE_DELEGATES (3)
 * usuarios de confianza pueden registrar egresos. La lista y su sustitución completa solo las
 * gestionan roles elevados; el permiso HTTP `cash_delegates:manage` filtra en el controlador,
 * pero aquí se refuerza con `isElevated` para que un rol “a medida” con permiso no pueda
 * ver ni alterar delegados sin ser dueño o administrador.
 */
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CashAccessService } from './cash-access.service';
import { MAX_CASH_EXPENSE_DELEGATES } from './cash.constants';
import type { SetCashDelegatesDto } from './dto/set-cash-delegates.dto';

@Injectable()
export class CashDelegatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly access: CashAccessService,
  ) {}

  /**
   * Lista delegados actuales. Solo dueño o administrador (roles elevados).
   */
  async list(actorUserId: string) {
    const slugs = await this.access.getRoleSlugsForUser(actorUserId);
    if (!this.access.isElevated(slugs)) {
      throw new ForbiddenException('Solo dueño o administrador puede consultar delegados de egreso');
    }

    const rows = await this.prisma.cashExpenseDelegate.findMany({
      include: {
        user: { select: { id: true, email: true, fullName: true, isActive: true } },
        assignedBy: { select: { id: true, email: true, fullName: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return { max: MAX_CASH_EXPENSE_DELEGATES, delegates: rows };
  }

  /**
   * Sustituye la lista completa de delegados (entre 0 y el máximo permitido por negocio).
   * Valida usuarios activos, sin duplicados, y deja traza en auditoría de dominio.
   */
  async setDelegates(
    actorUserId: string,
    dto: SetCashDelegatesDto,
    meta: { ip?: string; userAgent?: string },
  ) {
    const slugs = await this.access.getRoleSlugsForUser(actorUserId);
    if (!this.access.isElevated(slugs)) {
      throw new ForbiddenException('Solo dueño o administrador puede gestionar delegados de egreso');
    }

    if (dto.userIds.length > MAX_CASH_EXPENSE_DELEGATES) {
      throw new BadRequestException(`Máximo ${MAX_CASH_EXPENSE_DELEGATES} delegados`);
    }

    const unique = new Set(dto.userIds);
    if (unique.size !== dto.userIds.length) {
      throw new BadRequestException('userIds duplicados');
    }

    for (const uid of dto.userIds) {
      const u = await this.prisma.user.findUnique({ where: { id: uid } });
      if (!u || !u.isActive) {
        throw new NotFoundException(`Usuario inválido o inactivo: ${uid}`);
      }
    }

    const before = await this.prisma.cashExpenseDelegate.findMany({
      select: { userId: true },
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.cashExpenseDelegate.deleteMany({});
      if (dto.userIds.length) {
        await tx.cashExpenseDelegate.createMany({
          data: dto.userIds.map((userId) => ({
            userId,
            assignedById: actorUserId,
          })),
        });
      }
    });

    await this.audit.recordDomain({
      actorUserId,
      action: 'cash_delegates.set',
      entityType: 'CashExpenseDelegate',
      entityId: dto.userIds.join(',') || 'empty',
      previousPayload: { userIds: before.map((b) => b.userId) },
      nextPayload: { userIds: dto.userIds },
      ipAddress: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    });

    return this.list(actorUserId);
  }
}
