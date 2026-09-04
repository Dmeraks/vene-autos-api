/**
 * API de delegados para egresos de caja.
 *
 * Rutas bajo el prefijo global `api/v1`. El guard de permisos exige `cash_delegates:manage`;
 * el servicio además exige rol elevado (dueño/administrador) para listar o reemplazar la lista.
 */
import { Body, Controller, Get, Put, Req } from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import type { JwtUserPayload } from '../auth/types/jwt-user.payload';
import { CashDelegatesService } from './cash-delegates.service';
import { SetCashDelegatesDto } from './dto/set-cash-delegates.dto';

@Controller('cash/delegates')
export class CashDelegatesController {
  constructor(private readonly delegates: CashDelegatesService) {}

  @Get()
  @RequirePermissions('cash_delegates:manage')
  list(@CurrentUser() actor: JwtUserPayload) {
    return this.delegates.list(actor.sub);
  }

  @Put()
  @RequirePermissions('cash_delegates:manage')
  set(
    @Body() dto: SetCashDelegatesDto,
    @CurrentUser() actor: JwtUserPayload,
    @Req() req: Request,
  ) {
    return this.delegates.setDelegates(actor.sub, dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
    });
  }
}
