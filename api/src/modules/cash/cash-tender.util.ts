import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/**
 * Si se informa `tenderRaw`, es el efectivo entregado (ingreso) o el total usado para cubrir el egreso.
 * El vuelto se calcula en servidor: tender − amount.
 */
export function resolveTenderAndChange(
  amount: Prisma.Decimal,
  tenderRaw: string | undefined | null,
): { tenderAmount: Prisma.Decimal | null; changeAmount: Prisma.Decimal | null } {
  const raw = tenderRaw?.trim();
  if (!raw) {
    return { tenderAmount: null, changeAmount: null };
  }
  const tender = new Prisma.Decimal(raw);
  if (tender.lte(0)) {
    throw new BadRequestException('El monto en efectivo recibido debe ser mayor a cero');
  }
  if (tender.lt(amount)) {
    throw new BadRequestException(
      'El efectivo recibido debe ser mayor o igual al monto del movimiento (no alcanza para el vuelto)',
    );
  }
  return {
    tenderAmount: tender,
    changeAmount: tender.minus(amount),
  };
}
