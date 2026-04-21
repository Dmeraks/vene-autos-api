/**
 * SKU consecutivo y alta de ítem «fantasma» (stock 0) cuando una cotización referencia un repuesto aún no cargado en inventario.
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import { InventoryItemKind, Prisma } from '@prisma/client';
import {
  AD_HOC_QUOTE_SKU_PREFIX,
  WORKSHOP_COUNTER_AD_HOC_SKU_KEY,
  normalizeInventorySkuNumeracion,
} from './inventory.constants';

function formatAdHocSkuDigits(sequence: number): string {
  return `${AD_HOC_QUOTE_SKU_PREFIX}-${String(sequence).padStart(6, '0')}`;
}

@Injectable()
export class InventoryAdhocSkuService {

  /** Expuesto para tests / consistencia de formato (sin tocar BD). */
  skuFromSequence(sequence: number): string {
    return normalizeInventorySkuNumeracion(formatAdHocSkuDigits(sequence));
  }

  /**
   * Dentro de la misma transacción: incrementa el contador global y crea `InventoryItem` con cantidad 0.
   */
  async createQuotedPartStub(
    tx: Prisma.TransactionClient,
    params: {
      name: string;
      reference?: string;
      measurementUnitId: string;
    },
  ) {
    const counter = await tx.workshopCounter.update({
      where: { key: WORKSHOP_COUNTER_AD_HOC_SKU_KEY },
      data: { value: { increment: 1 } },
    });
    const sku = this.skuFromSequence(counter.value);
    return tx.inventoryItem.create({
      data: {
        sku,
        supplier: '',
        category: '',
        itemKind: InventoryItemKind.PART,
        name: params.name.trim(),
        reference: params.reference?.trim() ?? '',
        measurementUnitId: params.measurementUnitId,
        quantityOnHand: new Prisma.Decimal(0),
        averageCost: null,
        trackStock: true,
        isActive: true,
      },
      include: {
        measurementUnit: { select: { id: true, slug: true, name: true } },
      },
    });
  }

  /** Resuelve la unidad de medida por slug (default `unit`). */
  async measurementUnitIdForSlug(tx: Prisma.TransactionClient, slugRaw: string | undefined): Promise<string> {
    const slug = (slugRaw?.trim() || 'unit').toLowerCase();
    const mu = await tx.measurementUnit.findUnique({ where: { slug } });
    if (!mu) {
      throw new NotFoundException(`Unidad de medida no encontrada: ${slug}`);
    }
    return mu.id;
  }
}
