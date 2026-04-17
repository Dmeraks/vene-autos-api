/**
 * API de solicitudes de egreso con aprobación (complemento al egreso directo por delegados).
 * Rutas bajo prefijo global `api/v1`.
 */
import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import type { JwtUserPayload } from '../auth/types/jwt-user.payload';
import { CashExpenseRequestsService } from './cash-expense-requests.service';
import { ApproveCashExpenseRequestDto } from './dto/approve-cash-expense-request.dto';
import { CreateCashExpenseRequestDto } from './dto/create-cash-expense-request.dto';
import { ListCashExpenseRequestsQueryDto } from './dto/list-cash-expense-requests.query.dto';
import { RejectCashExpenseRequestDto } from './dto/reject-cash-expense-request.dto';

@Controller('cash/expense-requests')
export class CashExpenseRequestsController {
  constructor(private readonly requests: CashExpenseRequestsService) {}

  @Post()
  @RequirePermissions('cash_expense_requests:create')
  create(
    @Body() dto: CreateCashExpenseRequestDto,
    @CurrentUser() actor: JwtUserPayload,
    @Req() req: Request,
  ) {
    return this.requests.create(actor.sub, dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
    });
  }

  @Get()
  @RequirePermissions('cash_expense_requests:read')
  list(@CurrentUser() actor: JwtUserPayload, @Query() query: ListCashExpenseRequestsQueryDto) {
    return this.requests.list(actor.sub, query);
  }

  @Get(':id')
  @RequirePermissions('cash_expense_requests:read')
  findOne(@Param('id') id: string, @CurrentUser() actor: JwtUserPayload) {
    return this.requests.findOne(actor.sub, id);
  }

  @Post(':id/approve')
  @RequirePermissions('cash_expense_requests:approve')
  approve(
    @Param('id') id: string,
    @Body() dto: ApproveCashExpenseRequestDto,
    @CurrentUser() actor: JwtUserPayload,
    @Req() req: Request,
  ) {
    return this.requests.approve(actor.sub, id, dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
    });
  }

  /** Cajero: registra el egreso en caja física para una solicitud ya aprobada. */
  @Post(':id/pay-out')
  @RequirePermissions('cash_movements:create_expense')
  payOut(@Param('id') id: string, @CurrentUser() actor: JwtUserPayload, @Req() req: Request) {
    return this.requests.payOut(actor.sub, id, {
      ip: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
    });
  }

  @Post(':id/reject')
  @RequirePermissions('cash_expense_requests:reject')
  reject(
    @Param('id') id: string,
    @Body() dto: RejectCashExpenseRequestDto,
    @CurrentUser() actor: JwtUserPayload,
    @Req() req: Request,
  ) {
    return this.requests.reject(actor.sub, id, dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
    });
  }

  @Post(':id/cancel')
  @RequirePermissions('cash_expense_requests:cancel')
  cancel(@Param('id') id: string, @CurrentUser() actor: JwtUserPayload, @Req() req: Request) {
    return this.requests.cancel(actor.sub, id, {
      ip: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
    });
  }
}
