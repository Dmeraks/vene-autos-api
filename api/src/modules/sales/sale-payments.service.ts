/**
 * Cobros de venta: ingreso en caja + `SalePayment` (1:1 con el movimiento).
 *
 * Mismas reglas que `WorkOrderPaymentsService`, adaptadas:
 *  - La venta debe estar CONFIRMED y no anulada.
 *  - El total a cobrar es `grandTotal` (líneas – descuentos + impuestos), calculado
 *    por el motor de totales compartido (no se deposita en BD).
 *  - Para `full`: suma de cobros == total; para `partial`: deja saldo > 0.
 *  - La venta NO cambia de estado al cobrarse por completo (queda CONFIRMED liquidada).
 */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CashMovementDirection,
  CashSessionStatus,
  Prisma,
  SalePaymentKind,
  SaleStatus,
  SaleLineType,
  WorkOrderLineType,
} from '@prisma/client';
import {
  computeBillingTotals,
  type LineForTotals,
} from '../../common/billing/billing-totals';
import { ceilWholeCop, decimalFromMoneyApiString } from '../../common/money/cop-money';
import { NotesPolicyService } from '../../common/notes-policy/notes-policy.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { JwtUserPayload } from '../auth/types/jwt-user.payload';
import { CASH_SALE_REFERENCE_TYPE } from '../cash/cash.constants';
import { resolveTenderAndChange } from '../cash/cash-tender.util';
import type { RecordSalePaymentDto } from './dto/record-sale-payment.dto';
import { SalesService } from './sales.service';
import { actorMayViewSaleFinancials } from './sales.visibility';

const userBrief = { select: { id: true, email: true, fullName: true } };

@Injectable()
export class SalePaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notes: NotesPolicyService,
    private readonly sales: SalesService,
  ) {}

  async list(saleId: string, actor: JwtUserPayload) {
    await this.sales.assertSaleVisible(actor, saleId);
    if (!actorMayViewSaleFinancials(actor)) {
      throw new ForbiddenException('No tenés permiso para ver cobros ni montos de esta venta.');
    }
    return this.prisma.salePayment.findMany({
      where: { saleId },
      orderBy: { createdAt: 'desc' },
      include: {
        recordedBy: userBrief,
        cashMovement: { include: { category: true } },
      },
    });
  }

  async record(
    saleId: string,
    actor: JwtUserPayload,
    dto: RecordSalePaymentDto,
    meta: { ip?: string; userAgent?: string },
  ) {
    await this.sales.assertSaleVisible(actor, saleId);

    const amount = decimalFromMoneyApiString(dto.amount);
    if (amount.lte(0)) {
      throw new BadRequestException('El monto debe ser mayor a cero');
    }

    const paymentNote = await this.notes.requireOperationalNote(
      'Nota del cobro de la venta',
      dto.note,
      'work_order_payment',
    );

    const { tenderAmount, changeAmount } = resolveTenderAndChange(amount, dto.tenderAmount);
    const slug = (dto.categorySlug?.trim() || 'ingreso_cobro').toLowerCase();
    const prismaKind: SalePaymentKind =
      dto.paymentKind === 'full' ? SalePaymentKind.FULL_SETTLEMENT : SalePaymentKind.PARTIAL;

    const { movement, payment, sale, session } = await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw(Prisma.sql`SELECT 1 FROM "sales" WHERE id = ${saleId} FOR UPDATE`);

        const sale = await tx.sale.findUnique({
          where: { id: saleId },
          select: {
            id: true,
            saleNumber: true,
            publicCode: true,
            status: true,
            origin: true,
          },
        });
        if (!sale) throw new NotFoundException('Venta no encontrada');
        if (sale.status !== SaleStatus.CONFIRMED) {
          throw new ConflictException(
            'Solo se pueden registrar cobros sobre ventas confirmadas (ni borrador ni anuladas).',
          );
        }

        // Recalculamos totales a partir de las líneas actuales (con snapshots).
        const lines = await tx.saleLine.findMany({
          where: { saleId: sale.id },
          select: {
            id: true,
            lineType: true,
            quantity: true,
            unitPrice: true,
            discountAmount: true,
            costSnapshot: true,
            taxRateId: true,
            taxRatePercentSnapshot: true,
            taxRate: { select: { kind: true } },
          },
        });
        const linesForTotals: LineForTotals[] = lines.map((ln) => ({
          id: ln.id,
          lineType:
            ln.lineType === SaleLineType.LABOR
              ? WorkOrderLineType.LABOR
              : WorkOrderLineType.PART,
          quantity: ln.quantity,
          unitPrice: ln.unitPrice,
          discountAmount: ln.discountAmount,
          costSnapshot: ln.costSnapshot,
          taxRateId: ln.taxRateId,
          taxRatePercentSnapshot: ln.taxRatePercentSnapshot,
          taxRate: ln.taxRate ? { kind: ln.taxRate.kind } : null,
        }));
        const totals = computeBillingTotals(linesForTotals);
        const totalDue = ceilWholeCop(totals.grandTotal);
        if (totalDue.lte(0)) {
          throw new BadRequestException(
            'No hay saldo pendiente (la venta no tiene importes o ya fue saldada).',
          );
        }

        const paidSum = await tx.salePayment.aggregate({
          where: { saleId: sale.id },
          _sum: { amount: true },
        });
        const already = paidSum._sum.amount ?? new Prisma.Decimal(0);
        const newTotalPaid = already.plus(amount);
        if (newTotalPaid.gt(totalDue)) {
          throw new BadRequestException(
            `El cobro excede el total de la venta (${totalDue.toString()}). Quedaría en ${newTotalPaid.toString()}.`,
          );
        }
        if (dto.paymentKind === 'partial') {
          if (!newTotalPaid.lt(totalDue)) {
            throw new BadRequestException(
              'Un abono debe dejar saldo pendiente. Si liquidás el total, elegí «Pago total».',
            );
          }
        } else if (!newTotalPaid.equals(totalDue)) {
          throw new BadRequestException(
            `El pago total debe igualar el saldo pendiente (${totalDue.toString()}). Con este cobro quedaría ${newTotalPaid.toString()}.`,
          );
        }

        const session = await tx.cashSession.findFirst({
          where: { status: CashSessionStatus.OPEN },
        });
        if (!session) throw new ConflictException('No hay sesión de caja abierta');

        const category = await tx.cashMovementCategory.findUnique({ where: { slug } });
        if (!category) throw new NotFoundException('Categoría no encontrada');
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
            referenceType: CASH_SALE_REFERENCE_TYPE,
            referenceId: sale.id,
            note: paymentNote,
            createdById: actor.sub,
          },
          include: { category: true, createdBy: userBrief },
        });

        const payment = await tx.salePayment.create({
          data: {
            saleId: sale.id,
            amount,
            kind: prismaKind,
            cashMovementId: movement.id,
            note: paymentNote,
            recordedById: actor.sub,
          },
          include: { recordedBy: userBrief, cashMovement: { include: { category: true } } },
        });

        return { movement, payment, sale, session };
      },
      { maxWait: 5000, timeout: 15_000 },
    );

    await this.audit.recordDomain({
      actorUserId: actor.sub,
      action: 'sales.payment_recorded',
      entityType: 'SalePayment',
      entityId: payment.id,
      previousPayload: null,
      nextPayload: {
        saleId: sale.id,
        saleNumber: sale.saleNumber,
        publicCode: sale.publicCode,
        paymentKind: dto.paymentKind,
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
      actorUserId: actor.sub,
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
        referenceType: CASH_SALE_REFERENCE_TYPE,
        referenceId: sale.id,
        saleId: sale.id,
        note: paymentNote,
      },
      ipAddress: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    });

    return payment;
  }
}
