/**
 * API de ventas (`/sales`).
 */
import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  InternalServerErrorException,
  Logger,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  RequireAnyPermission,
  RequirePermissions,
} from '../../common/decorators/permissions.decorator';
import type { JwtUserPayload } from '../auth/types/jwt-user.payload';
import {
  ReceiptsService,
  type SaleForReceipt,
} from '../receipts/receipts.service';
import { CancelSaleDto } from './dto/cancel-sale.dto';
import { CreateSaleDto } from './dto/create-sale.dto';
import { CreateSaleFromWorkOrderDto } from './dto/create-sale-from-work-order.dto';
import { CreateSaleLineDto } from './dto/create-sale-line.dto';
import { ListSalesQueryDto } from './dto/list-sales.query.dto';
import { RecordSalePaymentDto } from './dto/record-sale-payment.dto';
import { UpdateSaleLineDto } from './dto/update-sale-line.dto';
import { UpdateSaleDto } from './dto/update-sale.dto';
import { SaleLinesService } from './sale-lines.service';
import { SalePaymentsService } from './sale-payments.service';
import { SalesService } from './sales.service';

@Controller('sales')
export class SalesController {
  private readonly logger = new Logger(SalesController.name);

  constructor(
    private readonly sales: SalesService,
    private readonly saleLines: SaleLinesService,
    private readonly salePayments: SalePaymentsService,
    private readonly receipts: ReceiptsService,
  ) {}

  @Get()
  @RequirePermissions('sales:read')
  list(@CurrentUser() actor: JwtUserPayload, @Query() query: ListSalesQueryDto) {
    return this.sales.list(actor, query);
  }

  @Post()
  @RequirePermissions('sales:create')
  create(
    @Body() dto: CreateSaleDto,
    @CurrentUser() actor: JwtUserPayload,
    @Req() req: Request,
  ) {
    return this.sales.create(actor, dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
    });
  }

  @Post('from-work-order')
  @RequirePermissions('sales:create')
  createFromWorkOrder(
    @Body() dto: CreateSaleFromWorkOrderDto,
    @CurrentUser() actor: JwtUserPayload,
    @Req() req: Request,
  ) {
    return this.sales.createFromWorkOrder(actor, dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
    });
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate, private')
  @Header('Pragma', 'no-cache')
  @RequirePermissions('sales:read')
  findOne(@Param('id') id: string, @CurrentUser() actor: JwtUserPayload) {
    return this.sales.findOne(id, actor);
  }

  /**
   * Recibo de venta imprimible (Fase 7.5). Devuelve HTML con encabezado del taller listo para
   * imprimir desde el navegador. No es documento fiscal; para régimen DIAN activo, se usa la
   * factura electrónica por separado.
   */
  @Get(':id/receipt')
  @RequirePermissions('sales:read')
  async receipt(
    @Param('id') id: string,
    @CurrentUser() actor: JwtUserPayload,
    @Res() res: Response,
  ) {
    const detail = await this.sales.findOne(id, actor);
    let payments: unknown[] = [];
    try {
      payments = (await this.salePayments.list(id, actor)) as unknown[];
    } catch {
      payments = [];
    }
    try {
      const payload: SaleForReceipt = {
        ...(detail as unknown as SaleForReceipt),
        payments: payments as unknown as SaleForReceipt['payments'],
      };
      const html = await this.receipts.renderSaleReceipt(payload);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.send(html);
    } catch (err) {
      this.logger.error(
        `Falló al renderizar recibo de venta ${id}: ${(err as Error)?.message ?? err}`,
        (err as Error)?.stack,
      );
      throw new InternalServerErrorException(
        `No se pudo generar el recibo de venta (${(err as Error)?.message ?? 'error interno'}).`,
      );
    }
  }

  @Patch(':id')
  @RequirePermissions('sales:update')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSaleDto,
    @CurrentUser() actor: JwtUserPayload,
    @Req() req: Request,
  ) {
    return this.sales.update(id, actor, dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
    });
  }

  @Post(':id/confirm')
  @RequirePermissions('sales:confirm')
  confirm(
    @Param('id') id: string,
    @CurrentUser() actor: JwtUserPayload,
    @Req() req: Request,
  ) {
    return this.sales.confirm(id, actor, {
      ip: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
    });
  }

  @Post(':id/cancel')
  @RequirePermissions('sales:cancel')
  cancel(
    @Param('id') id: string,
    @Body() dto: CancelSaleDto,
    @CurrentUser() actor: JwtUserPayload,
    @Req() req: Request,
  ) {
    return this.sales.cancel(id, actor, dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
    });
  }

  // --- Líneas ---

  @Get(':id/lines')
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate, private')
  @Header('Pragma', 'no-cache')
  @RequirePermissions('sales:read')
  listLines(@Param('id') id: string, @CurrentUser() actor: JwtUserPayload) {
    return this.saleLines.list(id, actor);
  }

  @Post(':id/lines')
  @RequirePermissions('sale_lines:create')
  addLine(
    @Param('id') id: string,
    @Body() dto: CreateSaleLineDto,
    @CurrentUser() actor: JwtUserPayload,
    @Req() req: Request,
  ) {
    return this.saleLines.create(id, actor, dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
    });
  }

  @Patch(':id/lines/:lineId')
  @RequirePermissions('sale_lines:update')
  updateLine(
    @Param('id') id: string,
    @Param('lineId') lineId: string,
    @Body() dto: UpdateSaleLineDto,
    @CurrentUser() actor: JwtUserPayload,
    @Req() req: Request,
  ) {
    return this.saleLines.update(id, lineId, actor, dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
    });
  }

  @Delete(':id/lines/:lineId')
  @RequirePermissions('sale_lines:delete')
  async removeLine(
    @Param('id') id: string,
    @Param('lineId') lineId: string,
    @CurrentUser() actor: JwtUserPayload,
    @Req() req: Request,
  ) {
    await this.saleLines.remove(id, lineId, actor, {
      ip: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
    });
    return this.saleLines.list(id, actor);
  }

  // --- Cobros ---

  @Get(':id/payments')
  @RequirePermissions('sales:read')
  listPayments(@Param('id') id: string, @CurrentUser() actor: JwtUserPayload) {
    return this.salePayments.list(id, actor);
  }

  @Post(':id/payments')
  @RequireAnyPermission('sales:record_payment', 'cash_movements:create_income')
  recordPayment(
    @Param('id') id: string,
    @Body() dto: RecordSalePaymentDto,
    @CurrentUser() actor: JwtUserPayload,
    @Req() req: Request,
  ) {
    return this.salePayments.record(id, actor, dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
    });
  }
}
