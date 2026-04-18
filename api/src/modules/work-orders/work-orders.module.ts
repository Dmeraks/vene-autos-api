/**
 * Fase 3 — órdenes de trabajo del taller.
 */
import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ReceiptsModule } from '../receipts/receipts.module';
import { WorkOrderLinesService } from './work-order-lines.service';
import { WorkOrdersController } from './work-orders.controller';
import { WorkOrderPaymentsService } from './work-order-payments.service';
import { WorkOrdersService } from './work-orders.service';

@Module({
  imports: [AuditModule, ReceiptsModule],
  controllers: [WorkOrdersController],
  providers: [WorkOrdersService, WorkOrderPaymentsService, WorkOrderLinesService],
  exports: [WorkOrdersService, WorkOrderPaymentsService],
})
export class WorkOrdersModule {}
