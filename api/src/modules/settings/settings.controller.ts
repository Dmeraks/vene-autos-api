import { Body, Controller, Get, Patch, Req } from '@nestjs/common';
import type { Request } from 'express';
import { NotesPolicyService } from '../../common/notes-policy/notes-policy.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import type { JwtUserPayload } from '../auth/types/jwt-user.payload';
import { PatchSettingsDto } from './dto/patch-settings.dto';
import { SettingsService } from './settings.service';

@Controller('settings')
export class SettingsController {
  constructor(
    private readonly settings: SettingsService,
    private readonly notes: NotesPolicyService,
  ) {}

  /**
   * Datos mínimos para formularios (cualquier usuario autenticado). No expone el mapa completo
   * de configuración ni requiere `settings:read`.
   */
  @Get('ui-context')
  async uiContext() {
    const [notesMinLengthChars, notesMinLengthWorkOrderPayment] = await Promise.all([
      this.notes.getMinLength('general'),
      this.notes.getMinLength('work_order_payment'),
    ]);
    return { notesMinLengthChars, notesMinLengthWorkOrderPayment };
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
