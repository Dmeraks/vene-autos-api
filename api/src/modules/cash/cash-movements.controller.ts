/** Entradas HTTP para registrar ingresos y egresos; la política de egresos se refuerza en servicio. */
import { Body, Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import type { JwtUserPayload } from '../auth/types/jwt-user.payload';
import { CashMovementsService } from './cash-movements.service';
import { CreateCashMovementDto } from './dto/create-cash-movement.dto';

@Controller('cash/movements')
export class CashMovementsController {
  constructor(private readonly movements: CashMovementsService) {}

  @Post('income')
  @RequirePermissions('cash_movements:create_income')
  createIncome(@Body() dto: CreateCashMovementDto, @CurrentUser() actor: JwtUserPayload, @Req() req: Request) {
    return this.movements.createIncome(actor.sub, dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
    });
  }

  @Post('expense')
  @RequirePermissions('cash_movements:create_expense')
  createExpense(@Body() dto: CreateCashMovementDto, @CurrentUser() actor: JwtUserPayload, @Req() req: Request) {
    return this.movements.createExpense(actor.sub, dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
    });
  }
}
