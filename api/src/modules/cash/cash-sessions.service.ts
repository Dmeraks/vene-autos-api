/**
 * Ciclo de vida de sesiones de caja: apertura, consulta y cierre con arqueo.
 *
 * Al cerrar se recalcula el saldo esperado (apertura + ingresos − egresos) y se compara con
 * el conteo físico; si difiere, se exige nota explicativa para dejar constancia operativa.
 */
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { CashMovementDirection, CashSessionStatus, Prisma } from '@prisma/client';
import { NotesPolicyService } from '../../common/notes-policy/notes-policy.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { CloseCashSessionDto } from './dto/close-cash-session.dto';
import type { OpenCashSessionDto } from './dto/open-cash-session.dto';

@Injectable()
export class CashSessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notes: NotesPolicyService,
  ) {}

  /** Sesión abierta con movimientos ordenados cronológicamente, o `null` si no hay ninguna. */
  async getCurrentOpen() {
    const row = await this.prisma.cashSession.findFirst({
      where: { status: CashSessionStatus.OPEN },
      include: {
        openedBy: { select: { id: true, email: true, fullName: true } },
        movements: {
          orderBy: { createdAt: 'asc' },
          include: {
            category: true,
            createdBy: { select: { id: true, email: true, fullName: true } },
          },
        },
      },
    });
    if (!row) {
      return null;
    }
    return this.withBalanceSummary(row);
  }

  /** Historial reciente de sesiones (abiertas y cerradas) para consulta administrativa. */
  async listRecent(take = 20) {
    return this.prisma.cashSession.findMany({
      take,
      orderBy: { openedAt: 'desc' },
      include: {
        openedBy: { select: { id: true, email: true, fullName: true } },
        closedBy: { select: { id: true, email: true, fullName: true } },
      },
    });
  }

  /** Detalle de una sesión por id, con movimientos; lanza 404 si no existe. */
  async findOne(id: string) {
    const s = await this.prisma.cashSession.findUnique({
      where: { id },
      include: {
        openedBy: { select: { id: true, email: true, fullName: true } },
        closedBy: { select: { id: true, email: true, fullName: true } },
        movements: {
          orderBy: { createdAt: 'asc' },
          include: {
            category: true,
            createdBy: { select: { id: true, email: true, fullName: true } },
          },
        },
      },
    });
    if (!s) {
      throw new NotFoundException('Sesión de caja no encontrada');
    }
    return this.withBalanceSummary(s);
  }

  /**
   * Saldo teórico = apertura + ingresos − egresos (misma fórmula que al cerrar con arqueo).
   * Se expone en JSON para el panel sin recalcular en el cliente.
   */
  private computeExpectedBalance(
    openingAmount: Prisma.Decimal,
    movements: { direction: CashMovementDirection; amount: Prisma.Decimal }[],
  ): { totalIncome: Prisma.Decimal; totalExpense: Prisma.Decimal; expected: Prisma.Decimal } {
    let income = new Prisma.Decimal(0);
    let expense = new Prisma.Decimal(0);
    for (const m of movements) {
      if (m.direction === CashMovementDirection.INCOME) {
        income = income.add(m.amount);
      } else {
        expense = expense.add(m.amount);
      }
    }
    const expected = openingAmount.add(income).sub(expense);
    return { totalIncome: income, totalExpense: expense, expected };
  }

  private withBalanceSummary<
    T extends {
      openingAmount: Prisma.Decimal;
      movements: { direction: CashMovementDirection; amount: Prisma.Decimal }[];
    },
  >(session: T) {
    const { totalIncome, totalExpense, expected } = this.computeExpectedBalance(
      session.openingAmount,
      session.movements,
    );
    return {
      ...session,
      balanceSummary: {
        totalIncome: totalIncome.toFixed(2),
        totalExpense: totalExpense.toFixed(2),
        expectedBalance: expected.toFixed(2),
        movementCount: session.movements.length,
      },
    };
  }

  /**
   * Abre una nueva sesión si no hay otra OPEN. El monto de apertura debe ser estrictamente positivo.
   * Tras migración `hardening_cash_one_open_session`, la BD también impide dos OPEN (índice único parcial).
   */
  async open(actorUserId: string, dto: OpenCashSessionDto, meta: { ip?: string; userAgent?: string }) {
    const existing = await this.prisma.cashSession.findFirst({
      where: { status: CashSessionStatus.OPEN },
    });
    if (existing) {
      throw new ConflictException('Ya existe una sesión de caja abierta');
    }

    const openingAmount = new Prisma.Decimal(dto.openingAmount);
    if (openingAmount.lte(0)) {
      throw new BadRequestException('El monto de apertura debe ser mayor a cero');
    }

    const openingNote = await this.notes.requireOperationalNote('Nota de apertura de caja', dto.note);

    let session;
    try {
      session = await this.prisma.cashSession.create({
        data: {
          status: CashSessionStatus.OPEN,
          openedById: actorUserId,
          openingAmount,
        },
      });
    } catch (err) {
      if (err instanceof PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Ya existe una sesión de caja abierta');
      }
      throw err;
    }

    await this.audit.recordDomain({
      actorUserId,
      action: 'cash_sessions.open',
      entityType: 'CashSession',
      entityId: session.id,
      previousPayload: null,
      nextPayload: { openingAmount: dto.openingAmount, note: openingNote },
      ipAddress: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    });

    return this.findOne(session.id);
  }

  /**
   * Cierra la sesión: persiste esperado, contado y nota de diferencia si aplica.
   * Quién puede invocarlo lo define el permiso `cash_sessions:close` (en seed, roles elevados).
   */
  async close(
    sessionId: string,
    actorUserId: string,
    dto: CloseCashSessionDto,
    meta: { ip?: string; userAgent?: string },
  ) {
    const session = await this.prisma.cashSession.findUnique({
      where: { id: sessionId },
      include: {
        movements: { select: { direction: true, amount: true } },
      },
    });
    if (!session) {
      throw new NotFoundException('Sesión de caja no encontrada');
    }
    if (session.status !== CashSessionStatus.OPEN) {
      throw new ConflictException('La sesión ya está cerrada');
    }

    const counted = new Prisma.Decimal(dto.closingCounted);
    if (counted.lt(0)) {
      throw new BadRequestException('closingCounted inválido');
    }

    const { expected } = this.computeExpectedBalance(session.openingAmount, session.movements);

    const diff = expected.sub(counted).abs();
    let differenceNote: string | null = null;
    if (diff.gt(0)) {
      differenceNote = await this.notes.requireOperationalNote(
        'Nota de diferencia en arqueo',
        dto.differenceNote,
      );
    } else {
      const t = dto.differenceNote?.trim();
      differenceNote = t ? t : null;
    }

    const updated = await this.prisma.cashSession.update({
      where: { id: sessionId },
      data: {
        status: CashSessionStatus.CLOSED,
        closedAt: new Date(),
        closedById: actorUserId,
        closingExpected: expected,
        closingCounted: counted,
        differenceNote,
      },
    });

    await this.audit.recordDomain({
      actorUserId,
      action: 'cash_sessions.close',
      entityType: 'CashSession',
      entityId: sessionId,
      previousPayload: {
        status: session.status,
        movementCount: session.movements.length,
      },
      nextPayload: {
        status: updated.status,
        closingExpected: expected.toFixed(2),
        closingCounted: counted.toFixed(2),
        differenceNote: updated.differenceNote,
      },
      ipAddress: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    });

    return this.findOne(sessionId);
  }
}
