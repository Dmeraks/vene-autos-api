import { BadRequestException } from '@nestjs/common';
import { canonicalPublicCodeFromLookupInput, formatWorkOrderPublicCode } from './work-order-public-code';

describe('formatWorkOrderPublicCode', () => {
  it('usa al menos 4 dígitos', () => {
    expect(formatWorkOrderPublicCode(1)).toBe('VEN-0001');
    expect(formatWorkOrderPublicCode(42)).toBe('VEN-0042');
  });

  it('crece el ancho con el número', () => {
    expect(formatWorkOrderPublicCode(12345)).toBe('VEN-12345');
  });
});

describe('canonicalPublicCodeFromLookupInput', () => {
  it('normaliza espacios y ceros a la izquierda', () => {
    expect(canonicalPublicCodeFromLookupInput('  ven-1  ')).toBe('VEN-0001');
    expect(canonicalPublicCodeFromLookupInput('VEN-0042')).toBe('VEN-0042');
  });

  it('rechaza prefijo incorrecto', () => {
    expect(() => canonicalPublicCodeFromLookupInput('ABC-1')).toThrow(BadRequestException);
  });
});
