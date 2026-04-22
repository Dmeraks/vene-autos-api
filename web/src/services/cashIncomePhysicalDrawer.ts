/**
 * Política del puente físico: el cajón solo debe pulsarse cuando el ingreso corresponde a
 * efectivo en mostrador. Las categorías `ingreso_transferencia`, `ingreso_tarjeta`, etc.
 * (seed Prisma) siguen generando movimiento de caja contable pero no implican abrir el cajón.
 *
 * Ver `api/prisma/seed.ts` — `ingreso_cobro` = «Cobro en efectivo».
 */
export function cashIncomeCategoryOpensPhysicalDrawer(slug: string | null | undefined): boolean {
  return String(slug ?? '').trim().toLowerCase() === 'ingreso_cobro'
}
