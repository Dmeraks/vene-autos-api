import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

const QUARTER = new Prisma.Decimal('0.25');
const ONE = new Prisma.Decimal(1);

/**
 * Repuestos en **galones** de aceite/lubricante: en OT la cantidad se informa en **cuartos de galón**
 * (entero 1 = 0,25 gal de consumo de inventario). El stock y la línea persisten en galones.
 */
export function inventoryItemUsesQuarterGallonOtQuantity(item: {
  sku: string;
  name: string;
  category: string;
  measurementUnit: { slug: string };
}): boolean {
  if (item.measurementUnit.slug !== 'gallon') return false;
  const blob = `${item.category ?? ''} ${item.name ?? ''} ${item.sku ?? ''}`.toLowerCase();
  return /\baceite\b/.test(blob) || /\blubricante\b/.test(blob) || /\boil\b/.test(blob);
}

/** Convierte cantidad ingresada en OT (cuartos) a galones para stock y persistencia. */
export function otPartQuantityToInventoryGallons(
  qtyOtInput: Prisma.Decimal,
  item: { sku: string; name: string; category: string; measurementUnit: { slug: string } },
): Prisma.Decimal {
  if (!inventoryItemUsesQuarterGallonOtQuantity(item)) return qtyOtInput;
  return qtyOtInput.mul(QUARTER);
}

/**
 * En OT la cantidad son **cuartos discretos** (1, 2, 3…); no galones fraccionarios en el payload
 * (evita ambigüedad: `0.25` en OT no debe interpretarse como ¼ gal ya en galones y volver a ×0.25).
 */
export function assertOtQuantityWholeQuartersForOilGallon(qtyOtInput: Prisma.Decimal, item: {
  sku: string;
  name: string;
  category: string;
  measurementUnit: { slug: string };
}): void {
  if (!inventoryItemUsesQuarterGallonOtQuantity(item)) return;
  if (qtyOtInput.lte(0)) {
    throw new BadRequestException('La cantidad debe ser mayor a cero');
  }
  if (!qtyOtInput.mod(ONE).isZero()) {
    throw new BadRequestException(
      'Para aceite en galones usá números enteros: 1 = ¼ gal, 2 = ½ gal, 4 = 1 gal (no uses decimales en la cantidad de la OT).',
    );
  }
}
