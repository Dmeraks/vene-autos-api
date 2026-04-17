/**
 * Inventario (Fase 5): unidades, ítems, recepciones de compra.
 */
import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CashModule } from '../cash/cash.module';
import { InventoryItemsController } from './inventory-items.controller';
import { InventoryItemsService } from './inventory-items.service';
import { MeasurementUnitsController } from './measurement-units.controller';
import { MeasurementUnitsService } from './measurement-units.service';
import { PurchaseReceiptsController } from './purchase-receipts.controller';
import { PurchaseReceiptsService } from './purchase-receipts.service';

@Module({
  imports: [AuditModule, CashModule],
  controllers: [MeasurementUnitsController, InventoryItemsController, PurchaseReceiptsController],
  providers: [MeasurementUnitsService, InventoryItemsService, PurchaseReceiptsService],
  exports: [InventoryItemsService, PurchaseReceiptsService, MeasurementUnitsService],
})
export class InventoryModule {}
