/**
 * CRUD de usuarios y endpoint `me`. Los permisos finos se declaran con `@RequirePermissions` por ruta.
 */
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import type { JwtUserPayload } from '../auth/types/jwt-user.payload';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /**
   * Perfil del actor autenticado. Requiere JWT válido; si falta usuario en request, 401 explícito.
   */
  @Get('me')
  me(@CurrentUser() user: JwtUserPayload | undefined) {
    if (!user) {
      throw new UnauthorizedException('Sesión no válida');
    }
    return this.users.findOne(user.sub);
  }

  @Get()
  @RequirePermissions('users:read')
  findAll() {
    return this.users.findAll();
  }

  @Get(':id')
  @RequirePermissions('users:read')
  findOne(@Param('id') id: string) {
    return this.users.findOne(id);
  }

  @Post()
  @RequirePermissions('users:create')
  create(@Body() dto: CreateUserDto, @CurrentUser() actor: JwtUserPayload, @Req() req: Request) {
    return this.users.create(dto, actor.sub, {
      ip: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
    });
  }

  @Patch(':id')
  @RequirePermissions('users:update')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: JwtUserPayload,
    @Req() req: Request,
  ) {
    if (dto.isActive === false && !actor.permissions.includes('users:deactivate')) {
      throw new ForbiddenException('Se requiere permiso users:deactivate para desactivar');
    }
    return this.users.update(id, dto, actor.sub, {
      ip: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
    });
  }
}
