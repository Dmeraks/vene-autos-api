import { formatDocumentNumber } from './document-number';

describe('formatDocumentNumber', () => {
  it('concatena prefijo y consecutivo sin separador', () => {
    expect(formatDocumentNumber('FEV', 1)).toBe('FEV1');
    expect(formatDocumentNumber('FEV', 12345)).toBe('FEV12345');
  });

  it('normaliza prefijo a MAYÚSCULAS', () => {
    expect(formatDocumentNumber('fev', 7)).toBe('FEV7');
    expect(formatDocumentNumber('  fev  ', 7)).toBe('FEV7');
  });

  it('rechaza prefijo vacío', () => {
    expect(() => formatDocumentNumber('', 1)).toThrow();
    expect(() => formatDocumentNumber('   ', 1)).toThrow();
  });

  it('rechaza consecutivo no positivo o no entero', () => {
    expect(() => formatDocumentNumber('FEV', 0)).toThrow();
    expect(() => formatDocumentNumber('FEV', -1)).toThrow();
    expect(() => formatDocumentNumber('FEV', 1.5)).toThrow();
  });
});
