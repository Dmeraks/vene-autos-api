import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  CashMovementDirection,
  InventoryMovementType,
  Prisma,
  PurchaseReceiptPaymentSource,
} from '@prisma/client';
import { ceilWholeCop, decimalFromMoneyApiString } from '../../common/money/cop-money';
import { NotesPolicyService } from '../../common/notes-policy/notes-policy.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CASH_PURCHASE_RECEIPT_EXPENSE_CATEGORY_SLUG, CASH_PURCHASE_RECEIPT_REFERENCE_TYPE } from '../cash/cash.constants';
import { CashMovementsService } from '../cash/cash-movements.service';
import { INVENTORY_REF_PURCHASE_RECEIPT_LINE } from './inventory.constants';
import type { CreatePurchaseReceiptDto, PurchaseReceiptLineInputDto } from './dto/create-purchase-receipt.dto';

type ResolvedLineMoney = {
  addVal: Prisma.Decimal;
  unitCostStored: Prisma.Decimal;
  lineTotalStored: Prisma.Decimal | null;
};

@Injectable()
export class PurchaseReceiptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notes: NotesPolicyService,
    private readonly cashMovements: CashMovementsService,
  ) {}

  async list() {
    const rows = await this.prisma.purchaseReceipt.findMany({
      take: 100,
      orderBy: { createdAt: 'desc' },
      include: {
        receivedBy: { select: { id: true, email: true, fullName: true } },
        lines: {
          include: {
            inventoryItem: { select: { id: true, sku: true, name: true } },
          },
        },
      },
    });

    return rows.map((r) => ({
      ...r,
      lines: r.lines.map((l) => ({
        ...l,
        /** Referencia c/u = total línea ÷ cantidad, techo a peso entero (sin fracciones de peso). */
        divisionReferenceUnitCop:
          l.lineTotalCost != null && l.quantity.gt(0)
            ? ceilWholeCop(l.lineTotalCost.div(l.quantity)).toString()
            : null,
      })),
    }));
  }

  async create(
    actorUserId: string,
    dto: CreatePurchaseReceiptDto,
    meta: { ip?: string; userAgent?: string },
  ) {
    const headerNote = await this.notes.requireOperationalNote('Nota de la recepción de compra', dto.note);

    const paySource: PurchaseReceiptPaymentSource =
      dto.paymentSource === 'BANK_TRANSFER'
        ? PurchaseReceiptPaymentSource.BANK_TRANSFER
        : PurchaseReceiptPaymentSource.CASH_REGISTER;

    let totalExpense = new Prisma.Decimal(0);
    const resolvedByIndex: (ResolvedLineMoney | null)[] = [];

    for (let i = 0; i < dto.lines.length; i++) {
      const line = dto.lines[i];
      const q = new Prisma.Decimal(line.quantity);
      if (q.lte(0)) {
        throw new BadRequestException('Cada línea debe tener cantidad mayor a cero');
      }
      const resolved = this.resolveLineMoney(line, q);
      resolvedByIndex[i] = resolved;
      if (resolved) {
        totalExpense = totalExpense.plus(resolved.addVal);
      }
    }
    totalExpense = ceilWholeCop(totalExpense);

    if (paySource === PurchaseReceiptPaymentSource.CASH_REGISTER && totalExpense.lte(0)) {
      throw new BadRequestException(
        'Si el pago salió en efectivo desde caja, informá costo unitario o costo total por línea (el egreso es la suma de esos montos, en pesos enteros hacia arriba).',
      );
    }

    const { receipt, expenseMovement } = await this.prisma.$transaction(async (tx) => {
      const header = await tx.purchaseReceipt.create({
        data: {
          note: headerNote,
          supplierRef: dto.supplierReference?.trim() ?? null,
          receivedById: actorUserId,
          paymentSource: paySource,
        },
      });

      for (let i = 0; i < dto.lines.length; i++) {
        const line = dto.lines[i];
        const qty = new Prisma.Decimal(line.quantity);
        const resolved = resolvedByIndex[i];

        await tx.$executeRaw(
          Prisma.sql`SELECT id FROM "inventory_items" WHERE id = ${line.inventoryItemId} FOR UPDATE`,
        );

        const item = await tx.inventoryItem.findUnique({
          where: { id: line.inventoryItemId },
        });
        if (!item || !item.isActive) {
          throw new NotFoundException(`Ítem no encontrado: ${line.inventoryItemId}`);
        }
        if (!item.trackStock) {
          throw new BadRequestException(`El ítem ${item.sku} no lleva stock`);
        }

        const prLine = await tx.purchaseReceiptLine.create({
          data: {
            purchaseReceiptId: header.id,
            inventoryItemId: item.id,
            quantity: qty,
            unitCost: resolved ? resolved.unitCostStored : null,
            lineTotalCost: resolved?.lineTotalStored ?? null,
          },
        });

        const prevQty = item.quantityOnHand;
        const nextQty = prevQty.plus(qty);

        let nextAvg = item.averageCost;
        if (resolved) {
          const prevVal = item.averageCost ? prevQty.mul(item.averageCost) : new Prisma.Decimal(0);
          const addVal = resolved.addVal;
          if (nextQty.gt(0)) {
            nextAvg = ceilWholeCop(prevVal.plus(addVal).div(nextQty));
          }
        }

        await tx.inventoryItem.update({
          where: { id: item.id },
          data: {
            quantityOnHand: nextQty,
            averageCost: nextAvg,
          },
        });

        await tx.inventoryMovement.create({
          data: {
            inventoryItemId: item.id,
            quantityChange: qty,
            movementType: InventoryMovementType.PURCHASE_IN,
            referenceType: INVENTORY_REF_PURCHASE_RECEIPT_LINE,
            referenceId: prLine.id,
            note: `Recepción ${header.id}`,
            createdById: actorUserId,
          },
        });
      }

      let expenseMovement: Awaited<ReturnType<CashMovementsService['recordPurchaseReceiptExpenseInTx']>> | null =
        null;
      if (
        paySource === PurchaseReceiptPaymentSource.CASH_REGISTER &&
        totalExpense.gt(0)
      ) {
        expenseMovement = await this.cashMovements.recordPurchaseReceiptExpenseInTx(tx, actorUserId, {
          amount: totalExpense,
          purchaseReceiptId: header.id,
          note: headerNote,
        });
      }

      const full = await tx.purchaseReceipt.findUniqueOrThrow({
        where: { id: header.id },
        include: { lines: { include: { inventoryItem: { select: { id: true, sku: true, name: true } } } } },
      });
      return { receipt: full, expenseMovement };
    });

    await this.audit.recordDomain({
      actorUserId,
      action: 'inventory.purchase_receipt_created',
      entityType: 'PurchaseReceipt',
      entityId: receipt.id,
      previousPayload: null,
      nextPayload: {
        lineCount: receipt.lines.length,
        note: headerNote,
        supplierReference: dto.supplierReference?.trim() ?? null,
        paymentSource: paySource,
        purchaseExpenseAmount:
          paySource === PurchaseReceiptPaymentSource.CASH_REGISTER && totalExpense.gt(0)
            ? totalExpense.toString()
            : null,
        cashMovementId: expenseMovement?.id ?? null,
      },
      ipAddress: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    });

    if (expenseMovement) {
      await this.audit.recordDomain({
        actorUserId,
        action: 'cash_movements.expense',
        entityType: 'CashMovement',
        entityId: expenseMovement.id,
        previousPayload: null,
        nextPayload: {
          sessionId: expenseMovement.sessionId,
          categorySlug: CASH_PURCHASE_RECEIPT_EXPENSE_CATEGORY_SLUG,
          direction: CashMovementDirection.EXPENSE,
          amount: totalExpense.toString(),
          referenceType: CASH_PURCHASE_RECEIPT_REFERENCE_TYPE,
          referenceId: receipt.id,
          note: headerNote,
          source: 'purchase_receipt',
        },
        ipAddress: meta.ip ?? null,
        userAgent: meta.userAgent ?? null,
      });
    }

    return receipt;
  }

  /**
   * `addVal`: dinero que entra al valor del stock (total línea tal cual, o cantidad × unitario en techo).
   * `unitCostStored`: costo unitario de inventario con techo a peso entero (etiquetas / listados).
   */
  private resolveLineMoney(line: PurchaseReceiptLineInputDto, qty: Prisma.Decimal): ResolvedLineMoney | null {
    const totalT = line.lineTotalCost?.trim();
    const unitT = line.unitCost?.trim();
    if (totalT && unitT) {
      throw new BadRequestException(
        'En cada línea usá solo “costo total de la línea” o solo “costo unitario”, no ambos a la vez.',
      );
    }
    if (!totalT && !unitT) {
      return null;
    }
    if (totalT) {
      const lineTotal = decimalFromMoneyApiString(totalT);
      if (lineTotal.lte(0)) {
        throw new BadRequestException('El costo total de línea debe ser mayor a cero');
      }
      const unitCeil = ceilWholeCop(lineTotal.div(qty));
      return { addVal: lineTotal, unitCostStored: unitCeil, lineTotalStored: lineTotal };
    }
    const rawUnit = decimalFromMoneyApiString(unitT!);
    if (rawUnit.lte(0)) {
      throw new BadRequestException('El costo unitario debe ser mayor a cero');
    }
    const unitCeil = ceilWholeCop(rawUnit);
    const addVal = qty.mul(unitCeil);
    return { addVal, unitCostStored: unitCeil, lineTotalStored: null };
  }
}
