import { BadRequestException } from '@nestjs/common';

/** Prefijo visible para el cliente (comprobante, seguimiento). */
export const WORK_ORDER_PUBLIC_CODE_PREFIX = 'VEN' as const;

/**
 * Código legible de la OT, alineado al número interno autoincremental.
 * Formato: `VEN-` + número con al menos 4 dígitos (ej. VEN-0001, VEN-12345).
 */
export function formatWorkOrderPublicCode(orderNumber: number): string {
  const s = String(orderNumber);
  const width = Math.max(4, s.length);
  return `${WORK_ORDER_PUBLIC_CODE_PREFIX}-${s.padStart(width, '0')}`;
}

/**
 * Normaliza el texto que escribe el cliente a la forma canónica guardada en BD
 * (acepta espacios y ceros a la izquierda en el tramo numérico).
 */
export function canonicalPublicCodeFromLookupInput(raw: string): string {
  const t = raw.trim().toUpperCase().replace(/\s+/g, '');
  const head = `${WORK_ORDER_PUBLIC_CODE_PREFIX}-`;
  if (!t.startsWith(head)) {
    throw new BadRequestException(`Ingresá el código del comprobante (ej. ${head}0001).`);
  }
  const digits = t.slice(head.length);
  if (!/^\d+$/.test(digits)) {
    throw new BadRequestException('El código debe ser VEN- seguido solo de números.');
  }
  if (digits.length > 12) {
    throw new BadRequestException('Código de orden no válido.');
  }
  const n = Number(digits);
  if (!Number.isSafeInteger(n) || n < 1) {
    throw new BadRequestException('Código de orden no válido.');
  }
  return formatWorkOrderPublicCode(n);
}
