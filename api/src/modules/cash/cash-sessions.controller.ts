/**
 * Endpoints REST de sesiones de caja (`/cash/sessions/...`).
 *
 * Orden de rutas: rutas fijas (`current`, `open`) antes de `:id` para que Nest no interprete
 * "current" como un id.
 */
import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import type { JwtUserPayload } from '../auth/types/jwt-user.payload';
import { CashSessionsService } from './cash-sessions.service';
import { CloseCashSessionDto } from './dto/close-cash-session.dto';
import { OpenCashSessionDto } from './dto/open-cash-session.dto';

@Controller('cash/sessions')
export class CashSessionsController {
  constructor(private readonly sessions: CashSessionsService) {}

  @Get('current')
  @RequirePermissions('cash_sessions:read')
  current() {
    return this.sessions.getCurrentOpen();
  }

  @Get()
  @RequirePermissions('cash_sessions:read')
  list() {
    return this.sessions.listRecent(30);
  }

  @Get(':id')
  @RequirePermissions('cash_sessions:read')
  findOne(@Param('id') id: string) {
    return this.sessions.findOne(id);
  }

  @Post('open')
  @RequirePermissions('cash_sessions:open')
  open(@Body() dto: OpenCashSessionDto, @CurrentUser() actor: JwtUserPayload, @Req() req: Request) {
    return this.sessions.open(actor.sub, dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
    });
  }

  @Post(':id/close')
  @RequirePermissions('cash_sessions:close')
  close(
    @Param('id') id: string,
    @Body() dto: CloseCashSessionDto,
    @CurrentUser() actor: JwtUserPayload,
    @Req() req: Request,
  ) {
    return this.sessions.close(id, actor.sub, dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
    });
  }
}
