import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import type { JwtUserPayload } from '../auth/types/jwt-user.payload';
import { CreateWorkshopReserveLineDto } from './dto/create-reserve-line.dto';
import { UpdateWorkshopReserveLineDto } from './dto/update-reserve-line.dto';
import { CreateWorkshopPayableDto } from './dto/create-payable.dto';
import { PayWorkshopPayableDto } from './dto/pay-payable.dto';
import { WorkshopFinanceService } from './workshop-finance.service';

@Controller('workshop-finance')
export class WorkshopFinanceController {
  constructor(private readonly svc: WorkshopFinanceService) {}

  @Get('reserve-lines')
  @RequirePermissions('workshop_finance:read')
  listReserveLines() {
    return this.svc.listReserveLines();
  }

  @Post('reserve-lines')
  @RequirePermissions('workshop_finance:manage')
  createReserveLine(
    @Body() dto: CreateWorkshopReserveLineDto,
    @CurrentUser() user: JwtUserPayload | undefined,
  ) {
    if (!user?.sub) throw new UnauthorizedException('Sesión no válida.');
    return this.svc.createReserveLine(user.sub, dto);
  }

  @Patch('reserve-lines/:id')
  @RequirePermissions('workshop_finance:manage')
  updateReserveLine(
    @Param('id') id: string,
    @Body() dto: UpdateWorkshopReserveLineDto,
    @CurrentUser() user: JwtUserPayload | undefined,
  ) {
    if (!user?.sub) throw new UnauthorizedException('Sesión no válida.');
    return this.svc.updateReserveLine(user.sub, id, dto);
  }

  @Get('reserve-totals')
  @RequirePermissions('workshop_finance:read')
  reserveTotals() {
    return this.svc.reserveTotals();
  }

  @Get('reserve-contributions')
  @RequirePermissions('workshop_finance:read')
  reserveContributions(@Query('take') takeRaw?: string) {
    const take = Math.min(200, Math.max(5, Number.parseInt(takeRaw ?? '60', 10) || 60));
    return this.svc.reserveContributionsHistory(take);
  }

  @Get('payables')
  @RequirePermissions('workshop_finance:read')
  listPayables() {
    return this.svc.listPayables();
  }

  @Post('payables')
  @RequirePermissions('workshop_finance:manage')
  createPayable(@Body() dto: CreateWorkshopPayableDto, @CurrentUser() user: JwtUserPayload | undefined) {
    if (!user?.sub) throw new UnauthorizedException('Sesión no válida.');
    return this.svc.createPayable(user.sub, dto);
  }

  @Post('payables/:id/payments')
  @RequirePermissions('workshop_finance:manage')
  recordPayment(
    @Param('id') id: string,
    @Body() dto: PayWorkshopPayableDto,
    @CurrentUser() user: JwtUserPayload | undefined,
    @Req() req: Request,
  ) {
    if (!user?.sub) throw new UnauthorizedException('Sesión no válida.');
    return this.svc.recordPayablePayment(user.sub, id, dto, {
      ip: req.ip,
      userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined,
    });
  }

  @Delete('payables/:id')
  @RequirePermissions('workshop_finance:manage')
  deletePayable(@Param('id') id: string, @CurrentUser() user: JwtUserPayload | undefined, @Req() req: Request) {
    if (!user?.sub) throw new UnauthorizedException('Sesión no válida.');
    return this.svc.deleteSettledPayable(user.sub, id, {
      ip: req.ip,
      userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined,
    });
  }
}
