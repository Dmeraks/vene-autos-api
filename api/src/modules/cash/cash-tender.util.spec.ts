import { Prisma } from '@prisma/client';
import { resolveTenderAndChange } from './cash-tender.util';

describe('resolveTenderAndChange', () => {
  it('devuelve null si no hay tender', () => {
    const amount = new Prisma.Decimal('75000');
    expect(resolveTenderAndChange(amount, undefined)).toEqual({
      tenderAmount: null,
      changeAmount: null,
    });
    expect(resolveTenderAndChange(amount, '   ')).toEqual({
      tenderAmount: null,
      changeAmount: null,
    });
  });

  it('calcula vuelto cuando tender ≥ amount', () => {
    const amount = new Prisma.Decimal('75000');
    const r = resolveTenderAndChange(amount, '100000');
    expect(r.tenderAmount?.toString()).toBe('100000');
    expect(r.changeAmount?.toString()).toBe('25000');
  });

  it('rechaza tender menor al amount', () => {
    const amount = new Prisma.Decimal('75000');
    expect(() => resolveTenderAndChange(amount, '50000')).toThrow('no alcanza');
  });
});
