/**
 * Cobros de orden de trabajo: ingreso en caja + `WorkOrderPayment` (1:1 con el movimiento).
 */
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CashMovementDirection, CashSessionStatus, Prisma, WorkOrderStatus } from '@prisma/client';
import { NotesPolicyService } from '../../common/notes-policy/notes-policy.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CASH_WORK_ORDER_REFERENCE_TYPE } from '../cash/cash.constants';
import { resolveTenderAndChange } from '../cash/cash-tender.util';
import type { RecordWorkOrderPaymentDto } from './dto/record-work-order-payment.dto';

const userBrief = { select: { id: true, email: true, fullName: true } };

@Injectable()
export class WorkOrderPaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notes: NotesPolicyService,
  ) {}

  async list(workOrderId: string) {
    await this.assertWorkOrderExists(workOrderId);
    return this.prisma.workOrderPayment.findMany({
      where: { workOrderId },
      orderBy: { createdAt: 'desc' },
      include: {
        recordedBy: userBrief,
        cashMovement: { include: { category: true } },
      },
    });
  }

  async summary(workOrderId: string) {
    const wo = await this.prisma.workOrder.findUnique({
      where: { id: workOrderId },
      select: { id: true, status: true, authorizedAmount: true, orderNumber: true },
    });
    if (!wo) {
      throw new NotFoundException('Orden de trabajo no encontrada');
    }
    const agg = await this.prisma.workOrderPayment.aggregate({
      where: { workOrderId },
      _sum: { amount: true },
      _count: { _all: true },
    });
    const totalPaid = agg._sum.amount ?? new Prisma.Decimal(0);
    const authorized = wo.authorizedAmount;
    let remaining: string | null = null;
    if (authorized != null) {
      remaining = authorized.minus(totalPaid).toFixed(2);
    }
    return {
      workOrderId: wo.id,
      orderNumber: wo.orderNumber,
      status: wo.status,
      authorizedAmount: authorized?.toString() ?? null,
      totalPaid: totalPaid.toString(),
      paymentCount: agg._count._all,
      remaining,
    };
  }

  async record(
    workOrderId: string,
    actorUserId: string,
    dto: RecordWorkOrderPaymentDto,
    meta: { ip?: string; userAgent?: string },
  ) {
    const amount = new Prisma.Decimal(dto.amount);
    if (amount.lte(0)) {
      throw new BadRequestException('El monto debe ser mayor a cero');
    }

    const paymentNote = await this.notes.requireOperationalNote(
      'Nota del cobro a la orden',
      dto.note,
      'work_order_payment',
    );

    const { tenderAmount, changeAmount } = resolveTenderAndChange(amount, dto.tenderAmount);

    const slug = (dto.categorySlug?.trim() || 'ingreso_cobro').toLowerCase();

    /**
     * Bloqueo de fila en la OT + lecturas/escrituras en la misma transacción para que el tope
     * `authorizedAmount` no se supere por cobros concurrentes (dos peticiones en paralelo).
     */
    const { movement, payment, wo, session } = await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw(Prisma.sql`SELECT 1 FROM "work_orders" WHERE id = ${workOrderId} FOR UPDATE`);

        const wo = await tx.workOrder.findUnique({
          where: { id: workOrderId },
          select: {
            id: true,
            orderNumber: true,
            status: true,
            authorizedAmount: true,
          },
        });
        if (!wo) {
          throw new NotFoundException('Orden de trabajo no encontrada');
        }
        if (wo.status === WorkOrderStatus.CANCELLED) {
          throw new ConflictException('No se pueden registrar cobros en una orden cancelada');
        }

        const paidSum = await tx.workOrderPayment.aggregate({
          where: { workOrderId: wo.id },
          _sum: { amount: true },
        });
        const already = paidSum._sum.amount ?? new Prisma.Decimal(0);
        if (wo.authorizedAmount != null && already.plus(amount).gt(wo.authorizedAmount)) {
          throw new BadRequestException('El cobro excede el monto autorizado de la orden');
        }

        const session = await tx.cashSession.findFirst({
          where: { status: CashSessionStatus.OPEN },
        });
        if (!session) {
          throw new ConflictException('No hay sesión de caja abierta');
        }

        const category = await tx.cashMovementCategory.findUnique({
          where: { slug },
        });
        if (!category) {
          throw new NotFoundException('Categoría no encontrada');
        }
        if (category.direction !== CashMovementDirection.INCOME) {
          throw new BadRequestException('La categoría no corresponde a un ingreso');
        }

        const movement = await tx.cashMovement.create({
          data: {
            sessionId: session.id,
            categoryId: category.id,
            direction: CashMovementDirection.INCOME,
            amount,
            tenderAmount,
            changeAmount,
            referenceType: CASH_WORK_ORDER_REFERENCE_TYPE,
            referenceId: wo.id,
            note: paymentNote,
            createdById: actorUserId,
          },
          include: { category: true, createdBy: userBrief },
        });

        const payment = await tx.workOrderPayment.create({
          data: {
            workOrderId: wo.id,
            amount,
            cashMovementId: movement.id,
            note: paymentNote,
            recordedById: actorUserId,
          },
          include: { recordedBy: userBrief, cashMovement: { include: { category: true } } },
        });

        return { movement, payment, wo, session };
      },
      { maxWait: 5000, timeout: 15_000 },
    );

    await this.audit.recordDomain({
      actorUserId,
      action: 'work_orders.payment_recorded',
      entityType: 'WorkOrderPayment',
      entityId: payment.id,
      previousPayload: null,
      nextPayload: {
        workOrderId: wo.id,
        orderNumber: wo.orderNumber,
        amount: dto.amount,
        tenderAmount: tenderAmount?.toString() ?? null,
        changeAmount: changeAmount?.toString() ?? null,
        cashMovementId: movement.id,
        categorySlug: slug,
        note: paymentNote,
      },
      ipAddress: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    });

    await this.audit.recordDomain({
      actorUserId,
      action: 'cash_movements.income',
      entityType: 'CashMovement',
      entityId: movement.id,
      previousPayload: null,
      nextPayload: {
        sessionId: session.id,
        categorySlug: slug,
        direction: CashMovementDirection.INCOME,
        amount: dto.amount,
        tenderAmount: tenderAmount?.toString() ?? null,
        changeAmount: changeAmount?.toString() ?? null,
        referenceType: CASH_WORK_ORDER_REFERENCE_TYPE,
        referenceId: wo.id,
        workOrderId: wo.id,
        note: paymentNote,
      },
      ipAddress: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    });

    return payment;
  }

  private async assertWorkOrderExists(workOrderId: string): Promise<void> {
    const exists = await this.prisma.workOrder.findUnique({
      where: { id: workOrderId },
      select: { id: true },
    });
    if (!exists) {
      throw new NotFoundException('Orden de trabajo no encontrada');
    }
  }
}
