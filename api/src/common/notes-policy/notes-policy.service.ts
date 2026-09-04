import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/** Notas de caja, inventario, solicitudes de egreso y revisión de las mismas. Ver `docs/NOTAS_POLITICA.md`. */
export const NOTES_MIN_LENGTH_GENERAL_KEY = 'notes.min_length_chars';

/** Solo notas de cobros vinculados a una orden de trabajo. */
export const NOTES_MIN_LENGTH_WORK_ORDER_PAYMENT_KEY = 'notes.min_length.work_order_payment';

/** @deprecated Usar `NOTES_MIN_LENGTH_GENERAL_KEY` (mismo valor). */
export const NOTES_MIN_LENGTH_SETTING_KEY = NOTES_MIN_LENGTH_GENERAL_KEY;

export type OperationalNoteScope = 'general' | 'work_order_payment';

const SCOPE_DEFAULTS: Record<OperationalNoteScope, number> = {
  general: 50,
  work_order_payment: 70,
};

const SCOPE_KEYS: Record<OperationalNoteScope, string> = {
  general: NOTES_MIN_LENGTH_GENERAL_KEY,
  work_order_payment: NOTES_MIN_LENGTH_WORK_ORDER_PAYMENT_KEY,
};

const MIN_ALLOWED = 5;
const MAX_ALLOWED = 500;

export const NOTES_MIN_LENGTH_SETTING_KEYS = [
  NOTES_MIN_LENGTH_GENERAL_KEY,
  NOTES_MIN_LENGTH_WORK_ORDER_PAYMENT_KEY,
] as const;

@Injectable()
export class NotesPolicyService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Mínimo efectivo para un ámbito. Si la clave no existe en BD, se usa el default del ámbito
   * (50 general, 70 cobros en OT).
   */
  async getMinLength(scope: OperationalNoteScope = 'general'): Promise<number> {
    const key = SCOPE_KEYS[scope];
    const fallback = SCOPE_DEFAULTS[scope];
    const row = await this.prisma.workshopSetting.findUnique({
      where: { key },
    });
    if (!row?.value) {
      return fallback;
    }
    const n = parseStoredInt(row.value);
    if (!Number.isFinite(n) || n < MIN_ALLOWED) {
      return fallback;
    }
    return Math.min(MAX_ALLOWED, Math.floor(n));
  }

  /**
   * Notas de operación: obligatorias y con longitud mínima según ámbito (`general` o `work_order_payment`).
   */
  async requireOperationalNote(
    label: string,
    raw: string | null | undefined,
    scope: OperationalNoteScope = 'general',
  ): Promise<string> {
    const min = await this.getMinLength(scope);
    const s = (raw ?? '').trim();
    if (s.length < min) {
      throw new BadRequestException(
        `${label}: escribí al menos ${min} caracteres (política del taller). Actualmente hay ${s.length} tras quitar espacios al inicio y al final.`,
      );
    }
    return s;
  }
}

function parseStoredInt(raw: unknown): number {
  return typeof raw === 'number'
    ? raw
    : typeof raw === 'string'
      ? parseInt(raw, 10)
      : typeof raw === 'boolean'
        ? NaN
        : NaN;
}
