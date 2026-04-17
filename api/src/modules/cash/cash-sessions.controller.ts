/**
 * Endpoints REST de sesiones de caja (`/cash/sessions/...`).
 *
 * Orden de rutas: rutas fijas (`current`, `open`) antes de `:id` para que Nest no interprete
 * "current" como un id.
 */
import {
  Body,
  Controller,
  Get,
  InternalServerErrorException,
  Logger,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  RequireAnyPermission,
  RequirePermissions,
} from '../../common/decorators/permissions.decorator';
import type { JwtUserPayload } from '../auth/types/jwt-user.payload';
import {
  type CashSessionForReceipt,
  ReceiptsService,
} from '../receipts/receipts.service';
import { CashSessionsService } from './cash-sessions.service';
import { CloseCashSessionDto } from './dto/close-cash-session.dto';
import { OpenCashSessionDto } from './dto/open-cash-session.dto';

@Controller('cash/sessions')
export class CashSessionsController {
  private readonly logger = new Logger(CashSessionsController.name);

  constructor(
    private readonly sessions: CashSessionsService,
    private readonly receipts: ReceiptsService,
    private readonly prisma: PrismaService,
  ) {}

  /** Solo `{ open: boolean }` — sin permiso extra; sirve para ocultar UI que exige caja abierta. */
  @Get('open-status')
  openStatus() {
    return this.sessions.getOpenStatus();
  }

  @Get('current')
  @RequireAnyPermission('cash_sessions:read', 'purchase_receipts:create')
  current() {
    return this.sessions.getCurrentOpen();
  }

  @Get()
  @RequirePermissions('cash_sessions:read')
  list() {
    return this.sessions.listRecent(30);
  }

  @Get(':id')
  @RequirePermissions('cash_sessions:read')
  findOne(@Param('id') id: string) {
    return this.sessions.findOne(id);
  }

  /**
   * Ticket de arqueo imprimible (Fase 7.6). HTML listo para `window.print()` con los datos del
   * taller, resumen del cierre y detalle de movimientos. Se recupera la nota de apertura del
   * `AuditLog` porque `CashSession` no la persiste como columna.
   */
  @Get(':id/receipt')
  @RequirePermissions('cash_sessions:read')
  async receipt(@Param('id') id: string, @Res() res: Response) {
    const detail = await this.sessions.findOne(id);

    let openingNote: string | null = null;
    try {
      const openEntry = await this.prisma.auditLog.findFirst({
        where: {
          entityType: 'CashSession',
          entityId: id,
          action: 'cash_sessions.open',
        },
        orderBy: { createdAt: 'asc' },
        select: { nextPayload: true },
      });
      const payload = openEntry?.nextPayload as { note?: unknown } | null | undefined;
      if (payload && typeof payload.note === 'string' && payload.note.trim().length > 0) {
        openingNote = payload.note.trim();
      }
    } catch {
      /** Ausencia del registro no debe tumbar la impresión; sólo queda sin la nota. */
      openingNote = null;
    }

    try {
      const payload: CashSessionForReceipt = {
        ...(detail as unknown as CashSessionForReceipt),
        openingNote,
      };
      const html = await this.receipts.renderCashSessionReceipt(payload);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.send(html);
    } catch (err) {
      this.logger.error(
        `Falló al renderizar arqueo de caja ${id}: ${(err as Error)?.message ?? err}`,
        (err as Error)?.stack,
      );
      throw new InternalServerErrorException(
        `No se pudo generar el arqueo (${(err as Error)?.message ?? 'error interno'}).`,
      );
    }
  }

  @Post('open')
  @RequirePermissions('cash_sessions:open')
  open(@Body() dto: OpenCashSessionDto, @CurrentUser() actor: JwtUserPayload, @Req() req: Request) {
    return this.sessions.open(actor.sub, dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
    });
  }

  @Post(':id/close')
  @RequirePermissions('cash_sessions:close')
  close(
    @Param('id') id: string,
    @Body() dto: CloseCashSessionDto,
    @CurrentUser() actor: JwtUserPayload,
    @Req() req: Request,
  ) {
    return this.sessions.close(id, actor.sub, dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
    });
  }
}
