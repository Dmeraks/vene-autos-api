import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { QUOTE_LINE_BUILD_PERMISSIONS } from '../../common/constants/quote-operational-read.permissions';
import { RequireAnyPermission, RequirePermissions } from '../../common/decorators/permissions.decorator';
import type { JwtUserPayload } from '../auth/types/jwt-user.payload';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { ServicesService } from './services.service';

@Controller('services')
export class ServicesController {
  constructor(private readonly services: ServicesService) {}

  @Get()
  @RequireAnyPermission('services:read', ...QUOTE_LINE_BUILD_PERMISSIONS)
  list(@Query('activeOnly') activeOnly?: string) {
    const onlyActive = activeOnly === 'true' || activeOnly === '1';
    return this.services.list({ onlyActive });
  }

  @Get(':id')
  @RequirePermissions('services:read')
  findOne(@Param('id') id: string) {
    return this.services.findOne(id);
  }

  @Post()
  @RequirePermissions('services:create')
  create(
    @Body() dto: CreateServiceDto,
    @CurrentUser() actor: JwtUserPayload,
    @Req() req: Request,
  ) {
    return this.services.create(actor.sub, dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
    });
  }

  @Patch(':id')
  @RequirePermissions('services:update')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateServiceDto,
    @CurrentUser() actor: JwtUserPayload,
    @Req() req: Request,
  ) {
    return this.services.update(id, actor.sub, dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
    });
  }
}
