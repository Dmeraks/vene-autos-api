import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InventoryMovementType, Prisma } from '@prisma/client';
import { NotesPolicyService } from '../../common/notes-policy/notes-policy.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { INVENTORY_REF_PURCHASE_RECEIPT_LINE } from './inventory.constants';
import type { CreatePurchaseReceiptDto } from './dto/create-purchase-receipt.dto';

@Injectable()
export class PurchaseReceiptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notes: NotesPolicyService,
  ) {}

  async list() {
    return this.prisma.purchaseReceipt.findMany({
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
  }

  async create(
    actorUserId: string,
    dto: CreatePurchaseReceiptDto,
    meta: { ip?: string; userAgent?: string },
  ) {
    const headerNote = await this.notes.requireOperationalNote('Nota de la recepción de compra', dto.note);

    const receipt = await this.prisma.$transaction(async (tx) => {
      const header = await tx.purchaseReceipt.create({
        data: {
          note: headerNote,
          supplierRef: dto.supplierReference?.trim() ?? null,
          receivedById: actorUserId,
        },
      });

      for (const line of dto.lines) {
        const qty = new Prisma.Decimal(line.quantity);
        if (qty.lte(0)) {
          throw new BadRequestException('Cada línea debe tener cantidad mayor a cero');
        }

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
            unitCost: line.unitCost ? new Prisma.Decimal(line.unitCost) : null,
          },
        });

        const prevQty = item.quantityOnHand;
        const nextQty = prevQty.plus(qty);

        let nextAvg = item.averageCost;
        const lineCost = prLine.unitCost;
        if (lineCost) {
          const lc = new Prisma.Decimal(lineCost);
          const prevVal = item.averageCost ? prevQty.mul(item.averageCost) : new Prisma.Decimal(0);
          const addVal = qty.mul(lc);
          if (nextQty.gt(0)) {
            nextAvg = prevVal.plus(addVal).div(nextQty);
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

      return tx.purchaseReceipt.findUniqueOrThrow({
        where: { id: header.id },
        include: { lines: { include: { inventoryItem: { select: { id: true, sku: true, name: true } } } } },
      });
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
      },
      ipAddress: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    });

    return receipt;
  }
}
