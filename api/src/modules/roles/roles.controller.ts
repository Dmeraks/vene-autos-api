import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import type { JwtUserPayload } from '../auth/types/jwt-user.payload';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { RolesService } from './roles.service';

@Controller('roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  @RequirePermissions('roles:read')
  findAll() {
    return this.roles.findAll();
  }

  @Get(':id')
  @RequirePermissions('roles:read')
  findOne(@Param('id') id: string) {
    return this.roles.findOne(id);
  }

  @Post()
  @RequirePermissions('roles:create')
  create(@Body() dto: CreateRoleDto, @CurrentUser() actor: JwtUserPayload, @Req() req: Request) {
    return this.roles.create(dto, actor.sub, {
      ip: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
    });
  }

  @Patch(':id')
  @RequirePermissions('roles:update')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateRoleDto,
    @CurrentUser() actor: JwtUserPayload,
    @Req() req: Request,
  ) {
    return this.roles.update(id, dto, actor.sub, {
      ip: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
    });
  }

  @Delete(':id')
  @RequirePermissions('roles:delete')
  remove(@Param('id') id: string, @CurrentUser() actor: JwtUserPayload, @Req() req: Request) {
    return this.roles.remove(id, actor.sub, {
      ip: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
    });
  }
}
