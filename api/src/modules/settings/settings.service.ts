import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NOTES_MIN_LENGTH_SETTING_KEYS } from '../../common/notes-policy/notes-policy.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getMap() {
    const rows = await this.prisma.workshopSetting.findMany({ orderBy: { key: 'asc' } });
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }

  async patch(
    values: Record<string, unknown>,
    actorUserId: string,
    meta: { ip?: string; userAgent?: string },
  ) {
    const before = await this.getMap();
    const keys = Object.keys(values);

    for (const key of keys) {
      assertKnownSettingValue(key, values[key]);
      await this.prisma.workshopSetting.upsert({
        where: { key },
        create: { key, value: values[key] as Prisma.InputJsonValue, updatedById: actorUserId },
        update: { value: values[key] as Prisma.InputJsonValue, updatedById: actorUserId },
      });
    }

    const after = await this.getMap();

    await this.audit.recordDomain({
      actorUserId,
      action: 'settings.update',
      entityType: 'WorkshopSetting',
      entityId: keys.join(','),
      previousPayload: pickKeys(before, keys),
      nextPayload: pickKeys(after, keys),
      ipAddress: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    });

    return this.getMap();
  }
}

function pickKeys(map: Record<string, unknown>, keys: string[]) {
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    if (k in map) {
      out[k] = map[k];
    }
  }
  return out;
}

/** Validación mínima de claves sensibles para no guardar valores incoherentes. */
function assertKnownSettingValue(key: string, value: unknown): void {
  if (key === 'auth.session_idle_timeout_minutes') {
    const n =
      typeof value === 'number'
        ? value
        : typeof value === 'string'
          ? parseInt(value, 10)
          : NaN;
    if (!Number.isFinite(n) || n < 1 || n > 24 * 60) {
      throw new BadRequestException(
        'auth.session_idle_timeout_minutes debe ser un número entero entre 1 y 1440 (minutos).',
      );
    }
  }
  if (key === 'users.create_requires_dueno_role') {
    if (value !== true && value !== false && value !== 'true' && value !== 'false') {
      throw new BadRequestException('users.create_requires_dueno_role debe ser true o false.');
    }
  }
  if ((NOTES_MIN_LENGTH_SETTING_KEYS as readonly string[]).includes(key)) {
    const n =
      typeof value === 'number'
        ? value
        : typeof value === 'string'
          ? parseInt(value, 10)
          : NaN;
    if (!Number.isFinite(n) || n < 5 || n > 500) {
      throw new BadRequestException(
        `${key} debe ser un entero entre 5 y 500 (caracteres mínimos de nota; ver docs/NOTAS_POLITICA.md).`,
      );
    }
  }
  if (key === 'ui.panel_theme') {
    if (value !== 'standard' && value !== 'commercial' && value !== 'saas_light') {
      throw new BadRequestException(
        'ui.panel_theme debe ser "standard", "commercial" o "saas_light".',
      );
    }
  }
  assertDianSettingValue(key, value);
}

/**
 * Claves de facturación electrónica DIAN (Fase 6: catálogo de valores; sin emisión aún).
 * Se dejan preparadas para el proveedor que se integre (Facture, Alegra, etc.).
 */
const DIAN_ALLOWED_PROVIDERS = new Set(['facture', 'alegra', 'siigo', 'carvajal', 'custom']);
const DIAN_ALLOWED_ENVIRONMENTS = new Set(['sandbox', 'production']);
const DIAN_ALLOWED_EMISSION_MODES = new Set(['async', 'sync']);

function assertDianSettingValue(key: string, value: unknown): void {
  if (!key.startsWith('dian.')) return;

  if (key === 'dian.enabled') {
    if (value !== true && value !== false && value !== 'true' && value !== 'false') {
      throw new BadRequestException('dian.enabled debe ser true o false.');
    }
    return;
  }
  if (key === 'dian.provider') {
    if (typeof value !== 'string' || !DIAN_ALLOWED_PROVIDERS.has(value)) {
      throw new BadRequestException(
        `dian.provider debe ser uno de: ${[...DIAN_ALLOWED_PROVIDERS].join(', ')}.`,
      );
    }
    return;
  }
  if (key === 'dian.environment') {
    if (typeof value !== 'string' || !DIAN_ALLOWED_ENVIRONMENTS.has(value)) {
      throw new BadRequestException('dian.environment debe ser "sandbox" o "production".');
    }
    return;
  }
  if (key === 'dian.emission_mode') {
    if (typeof value !== 'string' || !DIAN_ALLOWED_EMISSION_MODES.has(value)) {
      throw new BadRequestException('dian.emission_mode debe ser "async" o "sync".');
    }
    return;
  }
  if (key === 'dian.resolution_from' || key === 'dian.resolution_to') {
    const n =
      typeof value === 'number' ? value : typeof value === 'string' ? parseInt(value, 10) : NaN;
    if (!Number.isFinite(n) || n < 1 || n > 2_147_483_647) {
      throw new BadRequestException(`${key} debe ser un entero positivo (rango DIAN válido).`);
    }
    return;
  }
  if (key === 'dian.resolution_valid_until') {
    if (value === '' || value === null || value === undefined) return;
    const s = typeof value === 'string' ? value : String(value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      throw new BadRequestException('dian.resolution_valid_until debe ser una fecha YYYY-MM-DD o vacío.');
    }
    return;
  }
  if (
    key === 'dian.api_base_url' ||
    key === 'dian.api_token' ||
    key === 'dian.company_nit' ||
    key === 'dian.company_verification_digit' ||
    key === 'dian.resolution_number' ||
    key === 'dian.resolution_prefix' ||
    key === 'dian.test_set_id'
  ) {
    if (typeof value !== 'string') {
      throw new BadRequestException(`${key} debe ser texto (puede quedar vacío).`);
    }
    if (value.length > 500) {
      throw new BadRequestException(`${key} no puede superar 500 caracteres.`);
    }
    return;
  }
}
