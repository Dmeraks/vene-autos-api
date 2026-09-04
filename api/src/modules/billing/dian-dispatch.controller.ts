import { Body, Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import type { JwtUserPayload } from '../auth/types/jwt-user.payload';
import { DianDispatchService } from './dian-dispatch.service';

class RunPendingDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  batchLimit?: number;
}

@Controller('dian-dispatch')
export class DianDispatchController {
  constructor(private readonly service: DianDispatchService) {}

  /**
   * Ejecuta un lote de reintentos sobre facturas DRAFT (tras caída DIAN o
   * por primera vez tras encender el proveedor). Devuelve resumen por factura.
   */
  @Post('run')
  @RequirePermissions('dian:manage_dispatch')
  runPending(
    @Body() dto: RunPendingDto,
    @CurrentUser() actor: JwtUserPayload,
    @Req() req: Request,
  ) {
    return this.service.runPending(
      actor,
      {
        ip: req.ip,
        userAgent: req.headers['user-agent'] as string | undefined,
      },
      { batchLimit: dto.batchLimit },
    );
  }
}
