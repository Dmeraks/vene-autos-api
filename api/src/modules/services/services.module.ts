/**
 * Fase 6 — catálogo de servicios del taller (mano de obra predefinida).
 * Independiente de inventario para respetar las reglas fiscales (IVA/retención de servicios).
 */
import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { TaxRatesModule } from '../tax-rates/tax-rates.module';
import { ServicesController } from './services.controller';
import { ServicesService } from './services.service';

@Module({
  imports: [AuditModule, TaxRatesModule],
  controllers: [ServicesController],
  providers: [ServicesService],
  exports: [ServicesService],
})
export class ServicesModule {}
