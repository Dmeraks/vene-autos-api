/**
 * Ítems de inventario (repuestos / materiales).
 */
import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import type { JwtUserPayload } from '../auth/types/jwt-user.payload';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { UpdateInventoryItemDto } from './dto/update-inventory-item.dto';
import { InventoryItemsService } from './inventory-items.service';

@Controller('inventory/items')
export class InventoryItemsController {
  constructor(private readonly items: InventoryItemsService) {}

  @Get()
  @RequirePermissions('inventory_items:read')
  list() {
    return this.items.list();
  }

  @Get(':id')
  @RequirePermissions('inventory_items:read')
  findOne(@Param('id') id: string) {
    return this.items.findOne(id);
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
}
