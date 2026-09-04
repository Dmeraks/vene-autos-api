import { BadRequestException } from '@nestjs/common';

/** Prefijo visible en el comprobante de venta (p. ej. VTA-0001). */
export const SALE_PUBLIC_CODE_PREFIX = 'VTA' as const;

/**
 * Código legible de la venta, alineado al número interno autoincremental.
 * Formato: `VTA-` + número con al menos 4 dígitos (ej. VTA-0001, VTA-12345).
 */
export function formatSalePublicCode(saleNumber: number): string {
  const s = String(saleNumber);
  const width = Math.max(4, s.length);
  return `${SALE_PUBLIC_CODE_PREFIX}-${s.padStart(width, '0')}`;
}

/**
 * Normaliza el texto que escribe el cliente (acepta espacios y ceros a la izquierda)
 * a la forma canónica guardada en BD.
 */
export function canonicalSalePublicCodeFromLookupInput(raw: string): string {
  const t = raw.trim().toUpperCase().replace(/\s+/g, '');
  const head = `${SALE_PUBLIC_CODE_PREFIX}-`;
  if (!t.startsWith(head)) {
    throw new BadRequestException(`Ingresá el código de la venta (ej. ${head}0001).`);
  }
  const digits = t.slice(head.length);
  if (!/^\d+$/.test(digits)) {
    throw new BadRequestException('El código debe ser VTA- seguido solo de números.');
  }
  if (digits.length > 12) {
    throw new BadRequestException('Código de venta no válido.');
  }
  const n = Number(digits);
  if (!Number.isSafeInteger(n) || n < 1) {
    throw new BadRequestException('Código de venta no válido.');
  }
  return formatSalePublicCode(n);
}
