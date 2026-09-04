import { BadRequestException } from '@nestjs/common';

/** Placa comparable en el taller: mayúsculas, sin espacios internos. */
export function normalizeVehiclePlate(plate: string): string {
  const n = plate.trim().toUpperCase().replace(/\s+/g, '');
  if (!n) {
    throw new BadRequestException('La placa no puede quedar vacía');
  }
  if (n.length > 20) {
    throw new BadRequestException('La placa normalizada excede 20 caracteres');
  }
  return n;
}

/**
 * Comparación laxa para consulta pública (código + placa): tolera guiones y espacios
 * de forma que `EKP-112` coincida con `EKP112` guardado en `plate_norm` o en la OT.
 */
export function comparableVehiclePlate(plate: string): string {
  const n = plate.trim().toUpperCase().replace(/\s+/g, '').replace(/-/g, '');
  if (!n) {
    throw new BadRequestException('La placa no puede quedar vacía');
  }
  if (n.length > 20) {
    throw new BadRequestException('La placa normalizada excede 20 caracteres');
  }
  return n;
}
