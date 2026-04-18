import { BadRequestException } from '@nestjs/common';
import { DATE_ONLY_REGEX } from './payroll.constants';

/** Parser estricto YYYY-MM-DD → Date UTC (00:00:00.000). */
export function parseDateOnlyUtc(ymd: string): Date {
  const m = DATE_ONLY_REGEX.exec(ymd);
  if (!m) {
    throw new BadRequestException('Fecha inválida (formato YYYY-MM-DD)');
  }
  const [y, mo, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d, 0, 0, 0, 0));
  if (Number.isNaN(dt.getTime())) {
    throw new BadRequestException('Fecha inválida');
  }
  return dt;
}

/** Formato YYYY-MM-DD a partir de un Date UTC. */
export function formatDateOnlyUtc(d: Date): string {
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

/**
 * Lunes 00:00:00.000 UTC de la semana a la que pertenece `d`.
 * Regla: ISO (lunes = inicio). Domingo queda FUERA de la semana lun→sáb; si d es domingo,
 * devolvemos el lunes siguiente para que el domingo actúe como "día de descanso post-sábado"
 * sin generar una corrida propia. El consumidor decide la semana mostrada.
 */
export function weekStartMondayUtc(d: Date): Date {
  const x = new Date(d.getTime());
  const dow = x.getUTCDay(); // 0=dom, 1=lun, ..., 6=sáb
  if (dow === 0) {
    // Domingo: el lunes "natural" de esta fecha sería el día siguiente.
    x.setUTCDate(x.getUTCDate() + 1);
  } else {
    // dow ∈ [1..6]: retroceder a lunes de la misma semana.
    const diff = dow - 1;
    x.setUTCDate(x.getUTCDate() - diff);
  }
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

/**
 * Dado el lunes de una semana, devuelve el sábado 23:59:59.999 UTC (día 6, 5 días después).
 * Así la semana de nómina es LUN 00:00 → SÁB 23:59:59.999 (6 días, sin domingo).
 */
export function weekEndSaturdayUtc(mondayUtc: Date): Date {
  const x = new Date(mondayUtc.getTime());
  x.setUTCDate(x.getUTCDate() + 5);
  x.setUTCHours(23, 59, 59, 999);
  return x;
}

/** Lunes del pasado más reciente (incluye hoy si es lunes). */
export function weekStartMondayUtcFromYmd(ymd: string): Date {
  const d = parseDateOnlyUtc(ymd);
  const dow = d.getUTCDay();
  if (dow === 1) {
    return d; // Exactamente lunes.
  }
  return weekStartMondayUtc(d);
}
