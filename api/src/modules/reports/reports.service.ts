import { BadRequestException, Injectable } from '@nestjs/common';
import { CashMovementDirection, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { EconomicSummaryQueryDto, ReportGranularity } from './dto/economic-summary.query.dto';

type Acc = {
  income: Prisma.Decimal;
  expense: Prisma.Decimal;
  otPayments: Prisma.Decimal;
  opened: number;
  delivered: number;
  vehicleIds: Set<string>;
};

function dayBoundsUtc(ymd: string): { start: Date; end: Date } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) throw new BadRequestException('Fecha inválida');
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const start = new Date(Date.UTC(y, mo - 1, d, 0, 0, 0, 0));
  const end = new Date(Date.UTC(y, mo - 1, d, 23, 59, 59, 999));
  return { start, end };
}

function startOfUtcWeek(d: Date): Date {
  const x = new Date(d.getTime());
  const dow = x.getUTCDay();
  const diff = (dow + 6) % 7;
  x.setUTCDate(x.getUTCDate() - diff);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

function periodKey(d: Date, g: ReportGranularity): string {
  const y = d.getUTCFullYear();
  const mo = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const mStr = String(mo).padStart(2, '0');
  const dStr = String(day).padStart(2, '0');
  if (g === 'day') return `${y}-${mStr}-${dStr}`;
  if (g === 'month') return `${y}-${mStr}`;
  if (g === 'fortnight') {
    const half = day <= 15 ? '1' : '2';
    return `${y}-${mStr}-${half}`;
  }
  const w0 = startOfUtcWeek(d);
  const wy = w0.getUTCFullYear();
  const wm = String(w0.getUTCMonth() + 1).padStart(2, '0');
  const wd = String(w0.getUTCDate()).padStart(2, '0');
  return `${wy}-${wm}-${wd}`;
}

function periodLabel(key: string, g: ReportGranularity): string {
  if (g === 'day') return key;
  if (g === 'month') return key;
  if (g === 'fortnight') {
    const [y, m, h] = key.split('-');
    return h === '1' ? `${y}-${m} (1.ª quincena)` : `${y}-${m} (2.ª quincena)`;
  }
  return `Semana desde ${key}`;
}

function emptyAcc(): Acc {
  return {
    income: new Prisma.Decimal(0),
    expense: new Prisma.Decimal(0),
    otPayments: new Prisma.Decimal(0),
    opened: 0,
    delivered: 0,
    vehicleIds: new Set(),
  };
}

function decStr(n: Prisma.Decimal): string {
  return n.toFixed(2);
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async economicSummary(query: EconomicSummaryQueryDto) {
    const { start: from } = dayBoundsUtc(query.from);
    const { end: to } = dayBoundsUtc(query.to);
    if (from > to) {
      throw new BadRequestException('«desde» debe ser anterior o igual a «hasta»');
    }
    const spanMs = to.getTime() - from.getTime();
    if (spanMs > 366 * 86400000) {
      throw new BadRequestException('El rango máximo es 366 días');
    }

    const g: ReportGranularity = query.granularity ?? 'day';

    const [movements, payments, openedWo, deliveredWo] = await Promise.all([
      this.prisma.cashMovement.findMany({
        where: { createdAt: { gte: from, lte: to } },
        select: { createdAt: true, direction: true, amount: true },
      }),
      this.prisma.workOrderPayment.findMany({
        where: { createdAt: { gte: from, lte: to } },
        select: { createdAt: true, amount: true },
      }),
      this.prisma.workOrder.findMany({
        where: { createdAt: { gte: from, lte: to } },
        select: { id: true, createdAt: true, vehicleId: true },
      }),
      this.prisma.workOrder.findMany({
        where: { deliveredAt: { gte: from, lte: to, not: null } },
        select: { id: true, deliveredAt: true, vehicleId: true },
      }),
    ]);

    const buckets = new Map<string, Acc>();

    function touch(key: string): Acc {
      let a = buckets.get(key);
      if (!a) {
        a = emptyAcc();
        buckets.set(key, a);
      }
      return a;
    }

    for (const m of movements) {
      const k = periodKey(m.createdAt, g);
      const a = touch(k);
      if (m.direction === CashMovementDirection.INCOME) {
        a.income = a.income.plus(m.amount);
      } else {
        a.expense = a.expense.plus(m.amount);
      }
    }

    for (const p of payments) {
      const k = periodKey(p.createdAt, g);
      const a = touch(k);
      a.otPayments = a.otPayments.plus(p.amount);
    }

    for (const w of openedWo) {
      const k = periodKey(w.createdAt, g);
      const a = touch(k);
      a.opened += 1;
      if (w.vehicleId) a.vehicleIds.add(w.vehicleId);
    }

    for (const w of deliveredWo) {
      if (!w.deliveredAt) continue;
      const k = periodKey(w.deliveredAt, g);
      const a = touch(k);
      a.delivered += 1;
      if (w.vehicleId) a.vehicleIds.add(w.vehicleId);
    }

    const keys = [...buckets.keys()].sort();
    const series = keys.map((periodKey) => {
      const a = buckets.get(periodKey)!;
      const net = a.income.minus(a.expense);
      return {
        periodKey,
        periodLabel: periodLabel(periodKey, g),
        incomeTotal: decStr(a.income),
        expenseTotal: decStr(a.expense),
        netCash: decStr(net),
        otPaymentsTotal: decStr(a.otPayments),
        workOrdersOpened: a.opened,
        workOrdersDelivered: a.delivered,
        distinctVehiclesTouched: a.vehicleIds.size,
      };
    });

    let tin = new Prisma.Decimal(0);
    let tex = new Prisma.Decimal(0);
    let totp = new Prisma.Decimal(0);
    let o = 0;
    let del = 0;
    for (const a of buckets.values()) {
      tin = tin.plus(a.income);
      tex = tex.plus(a.expense);
      totp = totp.plus(a.otPayments);
      o += a.opened;
      del += a.delivered;
    }

    const distinctVehiclesPeriod = new Set<string>();
    for (const w of openedWo) {
      if (w.vehicleId) distinctVehiclesPeriod.add(w.vehicleId);
    }
    for (const w of deliveredWo) {
      if (w.vehicleId) distinctVehiclesPeriod.add(w.vehicleId);
    }

    return {
      from: query.from,
      to: query.to,
      granularity: g,
      disclaimer:
        'Los importes provienen de movimientos de caja y cobros en OT. Margen bruto/neto sobre costo de repuestos no está calculado en esta versión.',
      series,
      totals: {
        incomeTotal: decStr(tin),
        expenseTotal: decStr(tex),
        otPaymentsTotal: decStr(totp),
        netCash: decStr(tin.minus(tex)),
        workOrdersOpened: o,
        workOrdersDelivered: del,
        distinctVehiclesTouched: distinctVehiclesPeriod.size,
      },
    };
  }
}
