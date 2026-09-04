/**
 * Al cerrar caja: aportes teóricos por línea de reserva (% sobre efectivo contado).
 * Sin Nest para evitar dependencia circular CashModule ↔ WorkshopFinanceModule.
 */
import { Prisma } from '@prisma/client';
import { ceilWholeCop } from '../../common/money/cop-money';

export async function appendReserveContributionsForClose(
  tx: Prisma.TransactionClient,
  cashSessionId: string,
  baseCountedRaw: Prisma.Decimal,
): Promise<void> {
  const baseCounted = ceilWholeCop(baseCountedRaw);
  const lines = await tx.workshopReserveLine.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
  for (const line of lines) {
    const pct = line.percent;
    const raw = baseCounted.mul(pct).div(100);
    const contribution = ceilWholeCop(raw);
    if (contribution.lte(0)) continue;
    await tx.cashSessionReserveContribution.create({
      data: {
        cashSessionId,
        reserveLineId: line.id,
        baseCashCounted: baseCounted,
        percentApplied: pct,
        contributionAmount: contribution,
      },
    });
  }
}
