/**
 * Ítems de inventario (repuestos / materiales).
 */
import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { QUOTE_LINE_BUILD_PERMISSIONS } from '../../common/constants/quote-operational-read.permissions';
import { RequireAnyPermission, RequirePermissions } from '../../common/decorators/permissions.decorator';
import type { JwtUserPayload } from '../auth/types/jwt-user.payload';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { UpdateInventoryItemDto } from './dto/update-inventory-item.dto';
import { InventoryItemsService } from './inventory-items.service';

@Controller('inventory/items')
export class InventoryItemsController {
  constructor(private readonly items: InventoryItemsService) {}

  @Get()
  @RequireAnyPermission('inventory_items:read', ...QUOTE_LINE_BUILD_PERMISSIONS)
  list(@CurrentUser() actor: JwtUserPayload) {
    return this.items.list(actor);
  }

  /** Resumen económico caneca (última compra, stock a costo, OT aprox.) para la pantalla Aceite. */
  @Get('oil-drum-economics')
  @RequirePermissions('inventory_items:read')
  oilDrumEconomics(@CurrentUser() actor: JwtUserPayload) {
    return this.items.oilDrumEconomics(actor);
  }

  /** Ítems ocultos del catálogo (`isActive=false`). Ver Inventario · modo desarrollador. */
  @Get('hidden-items')
  @RequirePermissions('inventory_items:read')
  hiddenInventoryItems(@CurrentUser() actor: JwtUserPayload) {
    return this.items.listHiddenInventoryItems(actor);
  }

  @Get(':id')
  @RequirePermissions('inventory_items:read')
  findOne(@Param('id') id: string, @CurrentUser() actor: JwtUserPayload) {
    return this.items.findOne(id, actor);
  }

  @Post()
  @RequirePermissions('inventory_items:create')
  create(
    @Body() dto: CreateInventoryItemDto,
    @CurrentUser() actor: JwtUserPayload,
    @Req() req: Request,
  ) {
    return this.items.create(actor.sub, dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
    });
  }

  @Patch(':id')
  @RequirePermissions('inventory_items:update')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateInventoryItemDto,
    @CurrentUser() actor: JwtUserPayload,
    @Req() req: Request,
  ) {
    return this.items.update(id, actor.sub, dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
    });
  }

  @Delete(':id')
  @RequirePermissions('inventory_items:delete')
  remove(@Param('id') id: string, @CurrentUser() actor: JwtUserPayload, @Req() req: Request) {
    return this.items.delete(id, actor.sub, {
      ip: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
    });
  }
}
