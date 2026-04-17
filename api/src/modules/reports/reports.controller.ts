import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CashJournalQueryDto } from './dto/cash-journal.query.dto';
import { DianStatusQueryDto } from './dto/dian-status.query.dto';
import { EconomicSummaryQueryDto } from './dto/economic-summary.query.dto';
import { ProfitabilityByServiceQueryDto } from './dto/profitability-by-service.query.dto';
import { ProfitabilityByTechnicianQueryDto } from './dto/profitability-by-technician.query.dto';
import { RevenueUnifiedQueryDto } from './dto/revenue-unified.query.dto';
import { SaleProfitabilityQueryDto } from './dto/sale-profitability.query.dto';
import { SalesByPaymentMethodQueryDto } from './dto/sales-by-payment-method.query.dto';
import { StockCriticalQueryDto } from './dto/stock-critical.query.dto';
import { TaxCausadoQueryDto } from './dto/tax-causado.query.dto';
import { WorkOrderProfitabilityQueryDto } from './dto/work-order-profitability.query.dto';
import { ReportsService } from './reports.service';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('economic-summary')
  @RequirePermissions('reports:read')
  economicSummary(@Query() query: EconomicSummaryQueryDto) {
    return this.reports.economicSummary(query);
  }

  /**
   * Fase 6 · Ingresos unificados (Factura > Venta > OT). Deduplica el camino
   * `Factura → Sale/WO` para no contar dos veces la misma operación.
   */
  @Get('revenue-unified')
  @RequirePermissions('reports:read')
  revenueUnified(@Query() query: RevenueUnifiedQueryDto) {
    return this.reports.revenueUnified(query);
  }

  /**
   * Fase 6 · Rentabilidad por OT entregada, usando el snapshot de costos de
   * cada línea al momento de crearla (margen histórico estable).
   */
  @Get('work-order-profitability')
  @RequirePermissions('reports:read')
  workOrderProfitability(@Query() query: WorkOrderProfitabilityQueryDto) {
    return this.reports.workOrderProfitability(query);
  }

  /**
   * Fase 6 · Libro diario de movimientos de caja (vista previa JSON).
   * `sessionId` opcional acota al arqueo de una sesión.
   */
  @Get('cash-journal')
  @RequirePermissions('reports:read')
  cashJournal(@Query() query: CashJournalQueryDto) {
    return this.reports.cashJournal(query);
  }

  /** Fase 6 · Export XLSX del libro diario (binario, stream directo al cliente). */
  @Get('cash-journal.xlsx')
  @RequirePermissions('reports:read')
  async cashJournalXlsx(
    @Query() query: CashJournalQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    const { buffer, filename } = await this.reports.cashJournalXlsx(query);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', String(buffer.length));
    res.end(buffer);
  }

  /**
   * Fase 8 · Ventas por medio de pago. Agrupa `CashMovement.INCOME` vinculados a
   * venta/OT/factura por `CashMovementCategory.slug`. Devuelve % del total y counts.
   */
  @Get('sales-by-payment-method')
  @RequirePermissions('reports:read')
  salesByPaymentMethod(@Query() query: SalesByPaymentMethodQueryDto) {
    return this.reports.salesByPaymentMethod(query);
  }

  /**
   * Fase 8 · Rentabilidad por venta confirmada. Simétrico a `workOrderProfitability`:
   * usa `SaleLine.costSnapshot` para margen histórico.
   */
  @Get('sale-profitability')
  @RequirePermissions('reports:read')
  saleProfitability(@Query() query: SaleProfitabilityQueryDto) {
    return this.reports.saleProfitability(query);
  }

  /**
   * Fase 8 · IVA/INC causado. Solo facturas ISSUED, agrupado por TaxRate. Útil para
   * llevar el control fiscal real antes del libro mayor.
   */
  @Get('tax-causado')
  @RequirePermissions('reports:read')
  taxCausado(@Query() query: TaxCausadoQueryDto) {
    return this.reports.taxCausado(query);
  }

  /**
   * Fase 8 · Estado DIAN: facturas por estado creadas en el rango + último
   * `InvoiceDispatchEvent` de cada ISSUED (aceptado / rechazado / pendiente).
   */
  @Get('dian-status')
  @RequirePermissions('reports:read')
  dianStatus(@Query() query: DianStatusQueryDto) {
    return this.reports.dianStatus(query);
  }

  /**
   * Fase 8 · Stock crítico (snapshot actual, sin rango). Threshold configurable por
   * setting global `inventory.stock_critical_threshold` con override opcional `?threshold=N`.
   */
  @Get('stock-critical')
  @RequirePermissions('reports:read')
  stockCritical(@Query() query: StockCriticalQueryDto) {
    return this.reports.stockCritical(query);
  }

  /** Fase 8 · Utilidad por técnico (OT DELIVERED agrupadas por `assignedTo`). */
  @Get('profitability-by-technician')
  @RequirePermissions('reports:read')
  profitabilityByTechnician(@Query() query: ProfitabilityByTechnicianQueryDto) {
    return this.reports.profitabilityByTechnician(query);
  }

  /** Fase 8 · Utilidad por servicio del catálogo (líneas LABOR de OT + Sale). */
  @Get('profitability-by-service')
  @RequirePermissions('reports:read')
  profitabilityByService(@Query() query: ProfitabilityByServiceQueryDto) {
    return this.reports.profitabilityByService(query);
  }
}
