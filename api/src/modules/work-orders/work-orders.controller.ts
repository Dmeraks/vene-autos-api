/**
 * API de órdenes de trabajo (`/work-orders`).
 */
import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import type { JwtUserPayload } from '../auth/types/jwt-user.payload';
import { CreateWorkOrderDto } from './dto/create-work-order.dto';
import { ListWorkOrdersQueryDto } from './dto/list-work-orders.query.dto';
import { RecordWorkOrderPaymentDto } from './dto/record-work-order-payment.dto';
import { UpdateWorkOrderDto } from './dto/update-work-order.dto';
import { WorkOrderPaymentsService } from './work-order-payments.service';
import { WorkOrdersService } from './work-orders.service';

@Controller('work-orders')
export class WorkOrdersController {
  constructor(
    private readonly workOrders: WorkOrdersService,
    private readonly workOrderPayments: WorkOrderPaymentsService,
  ) {}

  @Post()
  @RequirePermissions('work_orders:create')
  create(
    @Body() dto: CreateWorkOrderDto,
    @CurrentUser() actor: JwtUserPayload,
    @Req() req: Request,
  ) {
    return this.workOrders.create(actor.sub, dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
    });
  }

  @Get()
  @RequirePermissions('work_orders:read')
  list(@CurrentUser() actor: JwtUserPayload, @Query() query: ListWorkOrdersQueryDto) {
    return this.workOrders.list(actor.sub, query);
  }

  @Get(':id/payments')
  @RequirePermissions('work_orders:read')
  listPayments(@Param('id') id: string) {
    return this.workOrderPayments.list(id);
  }

  @Get(':id/summary')
  @RequirePermissions('work_orders:read')
  paymentsSummary(@Param('id') id: string) {
    return this.workOrderPayments.summary(id);
  }

  @Post(':id/payments')
  @RequirePermissions('work_orders:record_payment', 'cash_movements:create_income')
  recordPayment(
    @Param('id') id: string,
    @Body() dto: RecordWorkOrderPaymentDto,
    @CurrentUser() actor: JwtUserPayload,
    @Req() req: Request,
  ) {
    return this.workOrderPayments.record(id, actor.sub, dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
    });
  }

  @Get(':id')
  @RequirePermissions('work_orders:read')
  findOne(@Param('id') id: string) {
    return this.workOrders.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions('work_orders:update')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateWorkOrderDto,
    @CurrentUser() actor: JwtUserPayload,
    @Req() req: Request,
  ) {
    return this.workOrders.update(id, actor.sub, dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
    });
  }
}
