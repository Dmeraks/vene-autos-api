/**
 * Solicitudes de egreso con aprobación asíncrona (dueño / administrador).
 *
 * No sustituye el flujo directo `POST /cash/movements/expense` para delegados o elevados.
 * Al aprobar, se crea un `CashMovement` EXPENSE en la sesión OPEN actual, con referencia establecida
 * en constantes, y se enlaza 1:1 desde la solicitud (`resultMovementId`).
 */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CashExpenseRequestStatus,
  CashMovementDirection,
  CashSessionStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CashAccessService } from './cash-access.service';
import { CASH_EXPENSE_REQUEST_REFERENCE_TYPE } from './cash.constants';
import type { ApproveCashExpenseRequestDto } from './dto/approve-cash-expense-request.dto';
import type { CreateCashExpenseRequestDto } from './dto/create-cash-expense-request.dto';
import type { ListCashExpenseRequestsQueryDto } from './dto/list-cash-expense-requests.query.dto';
import type { RejectCashExpenseRequestDto } from './dto/reject-cash-expense-request.dto';

const LIST_TAKE = 100;

@Injectable()
export class CashExpenseRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly access: CashAccessService,
  ) {}

  /** PENDIENTE y con `expiresAt` vencido: no admite aprobación ni rechazo. */
  private isPendingExpired(
    row: { status: CashExpenseRequestStatus; expiresAt: Date | null },
  ): boolean {
    return (
      row.status === CashExpenseRequestStatus.PENDING &&
      !!row.expiresAt &&
      row.expiresAt.getTime() < Date.now()
    );
  }

  /**
   * Marca como EXPIRED las solicitudes PENDING cuya fecha límite ya pasó.
   * Se usa en tareas programadas y antes de revisar una solicitud, para mantener el estado en BD.
   */
  async flushExpiredPendingRequests(): Promise<number> {
    const result = await this.prisma.cashExpenseRequest.updateMany({
      where: {
        status: CashExpenseRequestStatus.PENDING,
        expiresAt: { lt: new Date() },
      },
      data: { status: CashExpenseRequestStatus.EXPIRED },
    });
    return result.count;
  }

  private async assertElevated(actorUserId: string): Promise<void> {
    const slugs = await this.access.getRoleSlugsForUser(actorUserId);
    if (!this.access.isElevated(slugs)) {
      throw new ForbiddenException('Solo dueño o administrador puede revisar esta solicitud');
    }
  }

  private async assertCanReadRow(actorUserId: string, row: { requestedById: string }) {
    const slugs = await this.access.getRoleSlugsForUser(actorUserId);
    if (this.access.isElevated(slugs)) {
      return;
    }
    if (row.requestedById !== actorUserId) {
      throw new ForbiddenException('No puede consultar solicitudes de otros usuarios');
    }
  }

  private enrich(row: Record<string, unknown> & { status: CashExpenseRequestStatus; expiresAt: Date | null }) {
    return {
      ...row,
      isExpired: this.isPendingExpired(row as { status: CashExpenseRequestStatus; expiresAt: Date | null }),
    };
  }

  async create(
    actorUserId: string,
    dto: CreateCashExpenseRequestDto,
    meta: { ip?: string; userAgent?: string },
  ) {
    const category = await this.prisma.cashMovementCategory.findUnique({
      where: { slug: dto.categorySlug },
    });
    if (!category) {
      throw new NotFoundException('Categoría no encontrada');
    }
    if (category.direction !== CashMovementDirection.EXPENSE) {
      throw new BadRequestException('La categoría debe ser de egreso');
    }

    const amount = new Prisma.Decimal(dto.amount);
    if (amount.lte(0)) {
      throw new BadRequestException('El monto debe ser mayor a cero');
    }

    let expiresAt: Date | null = null;
    if (dto.expiresAt) {
      expiresAt = new Date(dto.expiresAt);
      if (Number.isNaN(expiresAt.getTime())) {
        throw new BadRequestException('expiresAt inválido');
      }
      if (expiresAt.getTime() <= Date.now()) {
        throw new BadRequestException('expiresAt debe ser una fecha futura');
      }
    }

    const row = await this.prisma.cashExpenseRequest.create({
      data: {
        status: CashExpenseRequestStatus.PENDING,
        categoryId: category.id,
        amount,
        referenceType: dto.referenceType?.trim() ?? null,
        referenceId: dto.referenceId?.trim() ?? null,
        note: dto.note?.trim() ?? null,
        requestedById: actorUserId,
        expiresAt,
      },
      include: this.defaultInclude(),
    });

    await this.audit.recordDomain({
      actorUserId,
      action: 'cash_expense_requests.created',
      entityType: 'CashExpenseRequest',
      entityId: row.id,
      previousPayload: null,
      nextPayload: {
        categorySlug: category.slug,
        amount: dto.amount,
        referenceType: dto.referenceType ?? null,
        referenceId: dto.referenceId ?? null,
        expiresAt: dto.expiresAt ?? null,
      },
      ipAddress: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    });

    return this.enrich(row as never);
  }

  async list(actorUserId: string, query: ListCashExpenseRequestsQueryDto) {
    const slugs = await this.access.getRoleSlugsForUser(actorUserId);
    const elevated = this.access.isElevated(slugs);

    const where: Prisma.CashExpenseRequestWhereInput = elevated
      ? query.status
        ? { status: query.status as CashExpenseRequestStatus }
        : {}
      : {
          requestedById: actorUserId,
          ...(query.status ? { status: query.status as CashExpenseRequestStatus } : {}),
        };

    const rows = await this.prisma.cashExpenseRequest.findMany({
      where,
      take: LIST_TAKE,
      orderBy: { createdAt: 'desc' },
      include: this.defaultInclude(),
    });

    return rows.map((r) => this.enrich(r as never));
  }

  async findOne(actorUserId: string, id: string) {
    const row = await this.prisma.cashExpenseRequest.findUnique({
      where: { id },
      include: this.defaultInclude(),
    });
    if (!row) {
      throw new NotFoundException('Solicitud no encontrada');
    }
    await this.assertCanReadRow(actorUserId, row);
    return this.enrich(row as never);
  }

  /**
   * Aprueba y genera el movimiento de caja. El `createdById` del movimiento es el aprobador
   * (responsabilidad contable de quien libera el egreso).
   */
  async approve(
    actorUserId: string,
    id: string,
    dto: ApproveCashExpenseRequestDto,
    meta: { ip?: string; userAgent?: string },
  ) {
    await this.assertElevated(actorUserId);
    await this.flushExpiredPendingRequests();

    const result = await this.prisma.$transaction(async (tx) => {
      const req = await tx.cashExpenseRequest.findUnique({
        where: { id },
        include: { category: true },
      });
      if (!req) {
        throw new NotFoundException('Solicitud no encontrada');
      }
      if (req.status !== CashExpenseRequestStatus.PENDING) {
        throw new ConflictException('La solicitud ya no está pendiente');
      }
      if (this.isPendingExpired(req)) {
        throw new GoneException('La solicitud expiró antes de poder aprobarse');
      }

      const session = await tx.cashSession.findFirst({
        where: { status: CashSessionStatus.OPEN },
      });
      if (!session) {
        throw new ConflictException('No hay sesión de caja abierta; no se puede aprobar ahora');
      }

      const movement = await tx.cashMovement.create({
        data: {
          sessionId: session.id,
          categoryId: req.categoryId,
          direction: CashMovementDirection.EXPENSE,
          amount: req.amount,
          referenceType: CASH_EXPENSE_REQUEST_REFERENCE_TYPE,
          referenceId: req.id,
          note: this.buildMovementNote(req.note, dto.approvalNote),
          createdById: actorUserId,
        },
      });

      const updated = await tx.cashExpenseRequest.updateMany({
        where: { id, status: CashExpenseRequestStatus.PENDING },
        data: {
          status: CashExpenseRequestStatus.APPROVED,
          resultMovementId: movement.id,
          reviewedById: actorUserId,
          reviewedAt: new Date(),
          approvalNote: dto.approvalNote?.trim() ?? null,
        },
      });

      if (updated.count !== 1) {
        throw new ConflictException('La solicitud ya no está pendiente');
      }

      const full = await tx.cashExpenseRequest.findUnique({
        where: { id },
        include: this.defaultInclude(),
      });
      if (!full) {
        throw new ConflictException('No se pudo cargar la solicitud tras aprobar');
      }
      return { movement, full };
    });

    await this.audit.recordDomain({
      actorUserId,
      action: 'cash_expense_requests.approved',
      entityType: 'CashExpenseRequest',
      entityId: id,
      previousPayload: { status: CashExpenseRequestStatus.PENDING },
      nextPayload: {
        movementId: result.movement.id,
        amount: result.movement.amount.toFixed(2),
        approvalNote: dto.approvalNote ?? null,
      },
      ipAddress: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    });

    await this.audit.recordDomain({
      actorUserId,
      action: 'cash_movements.expense',
      entityType: 'CashMovement',
      entityId: result.movement.id,
      previousPayload: null,
      nextPayload: {
        sessionId: result.movement.sessionId,
        fromExpenseRequestId: id,
        direction: CashMovementDirection.EXPENSE,
        amount: result.movement.amount.toFixed(2),
      },
      ipAddress: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    });

    return this.enrich(result.full as never);
  }

  async reject(
    actorUserId: string,
    id: string,
    dto: RejectCashExpenseRequestDto,
    meta: { ip?: string; userAgent?: string },
  ) {
    await this.assertElevated(actorUserId);
    await this.flushExpiredPendingRequests();

    const req = await this.prisma.cashExpenseRequest.findUnique({ where: { id } });
    if (!req) {
      throw new NotFoundException('Solicitud no encontrada');
    }
    if (req.status !== CashExpenseRequestStatus.PENDING) {
      throw new ConflictException('La solicitud ya no está pendiente');
    }
    if (this.isPendingExpired(req)) {
      throw new GoneException('La solicitud expiró; use estado explícito o cancele si aplica');
    }

    const updated = await this.prisma.cashExpenseRequest.updateMany({
      where: { id, status: CashExpenseRequestStatus.PENDING },
      data: {
        status: CashExpenseRequestStatus.REJECTED,
        reviewedById: actorUserId,
        reviewedAt: new Date(),
        rejectionReason: dto.rejectionReason.trim(),
      },
    });
    if (updated.count !== 1) {
      throw new ConflictException('La solicitud ya no está pendiente');
    }

    const full = await this.prisma.cashExpenseRequest.findUnique({
      where: { id },
      include: this.defaultInclude(),
    });

    await this.audit.recordDomain({
      actorUserId,
      action: 'cash_expense_requests.rejected',
      entityType: 'CashExpenseRequest',
      entityId: id,
      previousPayload: { status: CashExpenseRequestStatus.PENDING },
      nextPayload: { rejectionReason: dto.rejectionReason.trim() },
      ipAddress: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    });

    return this.enrich(full as never);
  }

  /**
   * Anula una solicitud pendiente. Solo quien la creó (no exige rol elevado).
   */
  async cancel(actorUserId: string, id: string, meta: { ip?: string; userAgent?: string }) {
    const req = await this.prisma.cashExpenseRequest.findUnique({ where: { id } });
    if (!req) {
      throw new NotFoundException('Solicitud no encontrada');
    }
    if (req.requestedById !== actorUserId) {
      throw new ForbiddenException('Solo quien creó la solicitud puede cancelarla');
    }
    if (req.status !== CashExpenseRequestStatus.PENDING) {
      throw new ConflictException('Solo se pueden cancelar solicitudes pendientes');
    }

    const updated = await this.prisma.cashExpenseRequest.updateMany({
      where: { id, status: CashExpenseRequestStatus.PENDING, requestedById: actorUserId },
      data: { status: CashExpenseRequestStatus.CANCELLED },
    });
    if (updated.count !== 1) {
      throw new ConflictException('No se pudo cancelar la solicitud');
    }

    const full = await this.prisma.cashExpenseRequest.findUnique({
      where: { id },
      include: this.defaultInclude(),
    });

    await this.audit.recordDomain({
      actorUserId,
      action: 'cash_expense_requests.cancelled',
      entityType: 'CashExpenseRequest',
      entityId: id,
      previousPayload: { status: CashExpenseRequestStatus.PENDING },
      nextPayload: { status: CashExpenseRequestStatus.CANCELLED },
      ipAddress: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    });

    return this.enrich(full as never);
  }

  private buildMovementNote(requestNote: string | null, approvalNote?: string): string | null {
    const parts: string[] = [];
    if (requestNote?.trim()) {
      parts.push(requestNote.trim());
    }
    if (approvalNote?.trim()) {
      parts.push(`[Aprobación] ${approvalNote.trim()}`);
    }
    if (parts.length === 0) {
      return null;
    }
    return parts.join('\n');
  }

  private defaultInclude(): Prisma.CashExpenseRequestInclude {
    return {
      category: true,
      requestedBy: { select: { id: true, email: true, fullName: true } },
      reviewedBy: { select: { id: true, email: true, fullName: true } },
      resultMovement: {
        select: {
          id: true,
          sessionId: true,
          amount: true,
          createdAt: true,
        },
      },
    };
  }
}
