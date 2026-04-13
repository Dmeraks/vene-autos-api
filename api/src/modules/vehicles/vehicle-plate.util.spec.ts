import { BadRequestException } from '@nestjs/common';
import { normalizeVehiclePlate } from './vehicle-plate.util';

describe('normalizeVehiclePlate', () => {
  it('mayúsculas y quita espacios internos', () => {
    expect(normalizeVehiclePlate('  abc 12 3  ')).toBe('ABC123');
  });

  it('rechaza vacío tras trim', () => {
    expect(() => normalizeVehiclePlate('   ')).toThrow(BadRequestException);
  });

  it('rechaza cadena que solo deja vacío tras normalizar', () => {
    expect(() => normalizeVehiclePlate('      ')).toThrow(BadRequestException);
  });

  it('rechaza más de 20 caracteres normalizados', () => {
    expect(() => normalizeVehiclePlate('A'.repeat(21))).toThrow(BadRequestException);
  });

  it('acepta exactamente 20 caracteres', () => {
    expect(normalizeVehiclePlate('A'.repeat(20))).toBe('A'.repeat(20));
  });
});
