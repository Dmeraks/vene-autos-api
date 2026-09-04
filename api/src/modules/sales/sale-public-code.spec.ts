import { BadRequestException } from '@nestjs/common';
import {
  SALE_PUBLIC_CODE_PREFIX,
  canonicalSalePublicCodeFromLookupInput,
  formatSalePublicCode,
} from './sale-public-code';

describe('sale-public-code', () => {
  describe('formatSalePublicCode', () => {
    it('rellena con ceros a 4 dígitos por defecto', () => {
      expect(formatSalePublicCode(1)).toBe('VTA-0001');
      expect(formatSalePublicCode(42)).toBe('VTA-0042');
    });

    it('no trunca números que ya superan los 4 dígitos', () => {
      expect(formatSalePublicCode(10000)).toBe('VTA-10000');
      expect(formatSalePublicCode(123456)).toBe('VTA-123456');
    });

    it('usa el prefijo VTA', () => {
      expect(formatSalePublicCode(7).startsWith(`${SALE_PUBLIC_CODE_PREFIX}-`)).toBe(true);
    });
  });

  describe('canonicalSalePublicCodeFromLookupInput', () => {
    it('acepta variantes y devuelve el código canónico', () => {
      expect(canonicalSalePublicCodeFromLookupInput('vta-1')).toBe('VTA-0001');
      expect(canonicalSalePublicCodeFromLookupInput(' VTA - 0001 ')).toBe('VTA-0001');
      // Los ceros a la izquierda colapsan al ancho mínimo (4 dígitos).
      expect(canonicalSalePublicCodeFromLookupInput('VTA-000001')).toBe('VTA-0001');
    });

    it('rechaza entradas sin prefijo o con letras', () => {
      expect(() => canonicalSalePublicCodeFromLookupInput('VEN-0001')).toThrow(
        BadRequestException,
      );
      expect(() => canonicalSalePublicCodeFromLookupInput('VTA-12A')).toThrow(
        BadRequestException,
      );
    });

    it('rechaza cero y negativos', () => {
      expect(() => canonicalSalePublicCodeFromLookupInput('VTA-0')).toThrow(BadRequestException);
    });
  });
});
