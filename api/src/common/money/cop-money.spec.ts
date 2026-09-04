import { Prisma } from '@prisma/client';
import { ceilWholeCop, decimalFromMoneyApiString } from './cop-money';

describe('ceilWholeCop', () => {
  it('redondea al peso entero hacia arriba', () => {
    expect(ceilWholeCop(new Prisma.Decimal('36363.636363')).toString()).toBe('36364');
    expect(ceilWholeCop(new Prisma.Decimal('10')).toString()).toBe('10');
    expect(ceilWholeCop(new Prisma.Decimal('9.01')).toString()).toBe('10');
    expect(ceilWholeCop(new Prisma.Decimal('2000000')).toString()).toBe('2000000');
  });
});

describe('decimalFromMoneyApiString', () => {
  it('interpreta enteros y aplica techo si hubiera fracción', () => {
    expect(decimalFromMoneyApiString('150000').toString()).toBe('150000');
    expect(decimalFromMoneyApiString('9.01').toString()).toBe('10');
  });
});
