import { Body, Controller, Get, Patch, Req } from '@nestjs/common';
import type { Request } from 'express';
import { NotesPolicyService } from '../../common/notes-policy/notes-policy.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import type { JwtUserPayload } from '../auth/types/jwt-user.payload';
import { PrismaService } from '../../prisma/prisma.service';
import { PatchSettingsDto } from './dto/patch-settings.dto';
import { SettingsService } from './settings.service';

@Controller('settings')
export class SettingsController {
  constructor(
    private readonly settings: SettingsService,
    private readonly notes: NotesPolicyService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Datos mínimos para formularios (cualquier usuario autenticado). No expone el mapa completo
   * de configuración ni requiere `settings:read`.
   */
  @Get('ui-context')
  async uiContext() {
    const [
      notesMinLengthChars,
      notesMinLengthWorkOrderPayment,
      themeRow,
      electronicInvoiceRow,
      workshopLegalName,
      arqueoAutoprintRow,
      stockCriticalThresholdRow,
    ] = await Promise.all([
      this.notes.getMinLength('general'),
      this.notes.getMinLength('work_order_payment'),
      this.prisma.workshopSetting.findUnique({ where: { key: 'ui.panel_theme' } }),
      this.prisma.workshopSetting.findUnique({
        where: { key: 'billing.electronic_invoice_enabled' },
      }),
      this.prisma.workshopSetting.findUnique({ where: { key: 'workshop.legal_name' } }),
      this.prisma.workshopSetting.findUnique({
        where: { key: 'cash.arqueo_autoprint_enabled' },
      }),
      this.prisma.workshopSetting.findUnique({
        where: { key: 'inventory.stock_critical_threshold' },
      }),
    ]);
    const raw = themeRow?.value;
    const panelTheme =
      raw === 'vene_autos'
        ? 'vene_autos'
        : raw === 'saas_light'
          ? 'saas_light'
          : 'saas_light';
    const eiRaw = electronicInvoiceRow?.value;
    const electronicInvoiceEnabled = eiRaw === true || eiRaw === 'true';
    const legalName =
      typeof workshopLegalName?.value === 'string' ? workshopLegalName.value : null;
    const arqueoRaw = arqueoAutoprintRow?.value;
    const arqueoAutoprintEnabled = arqueoRaw === true || arqueoRaw === 'true';
    const stockRaw = stockCriticalThresholdRow?.value;
    const stockCriticalThreshold =
      typeof stockRaw === 'number' && Number.isFinite(stockRaw) && stockRaw >= 0
        ? Math.floor(stockRaw)
        : typeof stockRaw === 'string' && /^\d+$/.test(stockRaw)
          ? Number.parseInt(stockRaw, 10)
          : 3;
    return {
      notesMinLengthChars,
      notesMinLengthWorkOrderPayment,
      panelTheme,
      electronicInvoiceEnabled,
      workshopLegalName: legalName,
      arqueoAutoprintEnabled,
      stockCriticalThreshold,
    };
  }

  @Get()
  @RequirePermissions('settings:read')
  getAll() {
    return this.settings.getMap();
  }

  @Patch()
  @RequirePermissions('settings:update')
  patch(
    @Body() dto: PatchSettingsDto,
    @CurrentUser() actor: JwtUserPayload,
    @Req() req: Request,
  ) {
    return this.settings.patch(dto.values, actor.sub, {
      ip: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
    });
  }
}
