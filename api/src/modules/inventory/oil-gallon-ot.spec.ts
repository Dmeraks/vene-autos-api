import { Prisma } from '@prisma/client';
import { oilOtQuarterUnitPriceToStoredGallonUnitPrice, otPartQuantityToInventoryGallons } from './oil-gallon-ot';

describe('oil-gallon-ot', () => {
  const aceiteGal = {
    sku: 'OIL-1',
    name: 'Aceite motor 5W30',
    category: 'Lubricantes',
    measurementUnit: { slug: 'gallon' as const },
  };

  it('convierte cuartos de entrada OT a galones de inventario', () => {
    const g = otPartQuantityToInventoryGallons(new Prisma.Decimal(2), aceiteGal);
    expect(g.toString()).toBe('0.5');
  });

  it('convierte precio por ¼ gal a precio por gal guardado (×4)', () => {
    const gal = oilOtQuarterUnitPriceToStoredGallonUnitPrice(new Prisma.Decimal(25000));
    expect(gal.toString()).toBe('100000');
  });
});
