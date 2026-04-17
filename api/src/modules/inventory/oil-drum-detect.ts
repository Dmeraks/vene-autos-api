/**
 * Misma heurística que `web/src/utils/oilDrumInventory.ts`: aceite en bulto grande (~55 gal).
 */
export function inventoryItemIsOilDrum55Gallon(item: {
  sku: string;
  name: string;
  category: string;
}): boolean {
  const blob = `${item.category ?? ''} ${item.name ?? ''} ${item.sku ?? ''}`.toLowerCase();
  const mentionsOil =
    /\baceite\b/.test(blob) ||
    blob.includes('lubricante') ||
    /\boil\b/.test(blob) ||
    blob.includes('motor');
  const mentionsLargePack =
    /\b55\b/.test(blob) ||
    blob.includes('55 gal') ||
    blob.includes('galón') ||
    blob.includes('galon') ||
    blob.includes('caneca') ||
    blob.includes('tambor') ||
    blob.includes('drum') ||
    blob.includes('208 l') ||
    blob.includes('208l');
  return mentionsOil && mentionsLargePack;
}
