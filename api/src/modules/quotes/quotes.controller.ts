/**
 * Cotizaciones (`/quotes`).
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
import { RequireAnyPermission, RequirePermissions } from '../../common/decorators/permissions.decorator';
import type { JwtUserPayload } from '../auth/types/jwt-user.payload';
import {
  QUOTE_LINE_BUILD_PERMISSIONS,
  QUOTE_LINE_DELETE_PERMISSIONS,
  QUOTE_LINE_PATCH_PERMISSIONS,
} from '../../common/constants/quote-operational-read.permissions';
import { QuoteForReceipt, ReceiptsService } from '../receipts/receipts.service';
import { CreateQuoteDto } from './dto/create-quote.dto';
import { CreateQuoteLineDto } from './dto/create-quote-line.dto';
import { ListQuotesQueryDto } from './dto/list-quotes.query.dto';
import { UpdateQuoteDto } from './dto/update-quote.dto';
import { UpdateQuoteLineDto } from './dto/update-quote-line.dto';
import { QuotesService } from './quotes.service';

const QUOTE_VIEW_ANY = [
  'quotes:read',
  'quotes:read_all',
  'quotes:create',
  'quotes:update',
  'quotes:view_financials',
  'quote_lines:create',
  'quote_lines:update',
  'quote_lines:delete',
] as const;

@Controller('quotes')
export class QuotesController {
  private readonly logger = new Logger(QuotesController.name);

  constructor(
    private readonly quotes: QuotesService,
    private readonly receipts: ReceiptsService,
  ) {}

  @Post()
  @RequireAnyPermission('quotes:create', 'quotes:read_all')
  create(@Body() dto: CreateQuoteDto, @CurrentUser() actor: JwtUserPayload, @Req() req: Request) {
    return this.quotes.create(actor, dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
    });
  }

  @Get()
  @RequireAnyPermission(...QUOTE_VIEW_ANY)
  list(@CurrentUser() actor: JwtUserPayload, @Query() query: ListQuotesQueryDto) {
    return this.quotes.list(actor, query);
  }

  /**
   * Comprobante imprimible (HTML → imprimir / guardar como PDF desde el navegador).
   * Mismo layout base que el recibo de OT; texto de cotización / presupuesto.
   */
  @Get(':id/receipt')
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate, private')
  @Header('Pragma', 'no-cache')
  @RequireAnyPermission(...QUOTE_VIEW_ANY)
  async receipt(@Param('id') id: string, @CurrentUser() actor: JwtUserPayload, @Res() res: Response) {
    try {
      const detail = await this.quotes.findOne(id, actor);
      const payload = detail as unknown as QuoteForReceipt;
      const html = await this.receipts.renderQuoteReceipt(payload);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.send(html);
    } catch (err) {
      this.logger.error(
        `Falló comprobante cotización ${id}: ${(err as Error)?.message ?? err}`,
        (err as Error)?.stack,
      );
      throw new InternalServerErrorException(
        `No se pudo generar el comprobante (${(err as Error)?.message ?? 'error interno'}).`,
      );
    }
  }

  @Get(':id')
  @RequireAnyPermission(...QUOTE_VIEW_ANY)
  findOne(@Param('id') id: string, @CurrentUser() actor: JwtUserPayload) {
    return this.quotes.findOne(id, actor);
  }

  @Patch(':id')
  @RequirePermissions('quotes:update')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateQuoteDto,
    @CurrentUser() actor: JwtUserPayload,
    @Req() req: Request,
  ) {
    return this.quotes.update(id, actor, dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
    });
  }

  /** Cotización aceptada → alta en maestro cliente + vehículo (solo si aún sin `vehicleId`). */
  @Post(':id/save-to-master')
  @RequirePermissions('quotes:update')
  saveToMaster(@Param('id') id: string, @CurrentUser() actor: JwtUserPayload, @Req() req: Request) {
    return this.quotes.saveQuoteToMaster(id, actor, {
      ip: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
    });
  }

  @Post(':id/lines')
  @RequireAnyPermission(...QUOTE_LINE_BUILD_PERMISSIONS)
  createLine(
    @Param('id') id: string,
    @Body() dto: CreateQuoteLineDto,
    @CurrentUser() actor: JwtUserPayload,
    @Req() req: Request,
  ) {
    return this.quotes.createLine(id, actor, dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
    });
  }

  @Patch(':id/lines/:lineId')
  @RequireAnyPermission(...QUOTE_LINE_PATCH_PERMISSIONS)
  updateLine(
    @Param('id') id: string,
    @Param('lineId') lineId: string,
    @Body() dto: UpdateQuoteLineDto,
    @CurrentUser() actor: JwtUserPayload,
    @Req() req: Request,
  ) {
    return this.quotes.updateLine(id, lineId, actor, dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
    });
  }

  @Delete(':id/lines/:lineId')
  @RequireAnyPermission(...QUOTE_LINE_DELETE_PERMISSIONS)
  deleteLine(
    @Param('id') id: string,
    @Param('lineId') lineId: string,
    @CurrentUser() actor: JwtUserPayload,
    @Req() req: Request,
  ) {
    return this.quotes.deleteLine(id, lineId, actor, {
      ip: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
    });
  }

  /** Solo borrador, anulada o rechazada (legacy). */
  @Delete(':id')
  @RequirePermissions('quotes:update')
  deleteQuote(@Param('id') id: string, @CurrentUser() actor: JwtUserPayload, @Req() req: Request) {
    return this.quotes.deleteQuote(id, actor, {
      ip: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
    });
  }
}
