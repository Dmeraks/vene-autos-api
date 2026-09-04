/**
 * Recepciones de compra (entrada de stock).
 */
import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import type { JwtUserPayload } from '../auth/types/jwt-user.payload';
import { CreatePurchaseReceiptDto } from './dto/create-purchase-receipt.dto';
import { PurchaseReceiptsService } from './purchase-receipts.service';

@Controller('inventory/purchase-receipts')
export class PurchaseReceiptsController {
  constructor(private readonly receipts: PurchaseReceiptsService) {}

  @Get()
  @RequirePermissions('purchase_receipts:read')
  list() {
    return this.receipts.list();
  }

  @Post()
  @RequirePermissions('purchase_receipts:create')
  create(
    @Body() dto: CreatePurchaseReceiptDto,
    @CurrentUser() actor: JwtUserPayload,
    @Req() req: Request,
  ) {
    return this.receipts.create(actor.sub, dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
    });
  }
}
