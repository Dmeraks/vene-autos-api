import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import type { JwtUserPayload } from '../auth/types/jwt-user.payload';
import { CreateFiscalResolutionDto } from './dto/create-fiscal-resolution.dto';
import { UpdateFiscalResolutionDto } from './dto/update-fiscal-resolution.dto';
import { FiscalResolutionsService } from './fiscal-resolutions.service';

@Controller('fiscal-resolutions')
export class FiscalResolutionsController {
  constructor(private readonly service: FiscalResolutionsService) {}

  @Get()
  @RequirePermissions('fiscal_resolutions:read')
  list() {
    return this.service.list();
  }

  @Get(':id')
  @RequirePermissions('fiscal_resolutions:read')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @RequirePermissions('fiscal_resolutions:manage')
  create(
    @Body() dto: CreateFiscalResolutionDto,
    @CurrentUser() actor: JwtUserPayload,
    @Req() req: Request,
  ) {
    return this.service.create(actor, dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
    });
  }

  @Patch(':id')
  @RequirePermissions('fiscal_resolutions:manage')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateFiscalResolutionDto,
    @CurrentUser() actor: JwtUserPayload,
    @Req() req: Request,
  ) {
    return this.service.update(id, actor, dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
    });
  }

  @Post(':id/deactivate')
  @RequirePermissions('fiscal_resolutions:manage')
  deactivate(
    @Param('id') id: string,
    @CurrentUser() actor: JwtUserPayload,
    @Req() req: Request,
  ) {
    return this.service.deactivate(id, actor, {
      ip: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
    });
  }
}
