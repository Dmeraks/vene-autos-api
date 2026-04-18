/**
 * Fase 3 — ventas / POS.
 */
import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ReceiptsModule } from '../receipts/receipts.module';
import { SaleLinesService } from './sale-lines.service';
import { SalePaymentsService } from './sale-payments.service';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';

@Module({
  imports: [AuditModule, ReceiptsModule],
  controllers: [SalesController],
  providers: [SalesService, SaleLinesService, SalePaymentsService],
  exports: [SalesService, SalePaymentsService],
})
export class SalesModule {}
