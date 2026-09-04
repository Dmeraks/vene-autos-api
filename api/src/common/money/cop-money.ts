import { Prisma } from '@prisma/client';

/** COP sin centavos: redondeo hacia +∞ al peso entero (política de costos / caja). */
export function ceilWholeCop(value: Prisma.Decimal): Prisma.Decimal {
  return value.toDecimalPlaces(0, Prisma.Decimal.ROUND_CEIL);
}

/**
 * Monto enviado por API (string validada como entero COP). Aplica techo por compatibilidad
 * con datos heredados que pudieran traer fracción de peso.
 */
export function decimalFromMoneyApiString(s: string): Prisma.Decimal {
  return ceilWholeCop(new Prisma.Decimal(s.trim()));
}
