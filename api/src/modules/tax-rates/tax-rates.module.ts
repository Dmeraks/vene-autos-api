/**
 * Fase 6 — catálogo de impuestos (IVA/INC).
 * Expone `TaxRatesService` para uso desde servicios/OT/facturación en fases siguientes.
 */
import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { TaxRatesController } from './tax-rates.controller';
import { TaxRatesService } from './tax-rates.service';

@Module({
  imports: [AuditModule],
  controllers: [TaxRatesController],
  providers: [TaxRatesService],
  exports: [TaxRatesService],
})
export class TaxRatesModule {}
