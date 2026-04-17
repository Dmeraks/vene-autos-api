/**
 * Autenticación pública con límites de frecuencia (anti fuerza bruta / abuso de registro).
 */
import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import type { JwtUserPayload } from './types/jwt-user.payload';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { PreviewRoleDto } from './dto/preview-role.dto';
import { RegisterDto } from './dto/register.dto';

@Controller('auth')
@UseGuards(ThrottlerGuard)
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.auth.login(dto.email, dto.password, {
      ip: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
    });
  }

  @Public()
  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  register(@Body() dto: RegisterDto, @Req() req: Request) {
    return this.auth.register(dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
    });
  }

  @Post('logout')
  logout(@CurrentUser() user: JwtUserPayload, @Req() req: Request) {
    return this.auth.logout(user.sub, user.sid, {
      ip: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
    });
  }

  /** Catálogo de roles para el panel «probar como» (solo administrador/dueño en la práctica). */
  @Get('preview-role/candidates')
  @RequirePermissions('auth:assume_role_preview')
  previewRoleCandidates(@CurrentUser() user: JwtUserPayload) {
    return this.auth.listPreviewRoleCandidates(user.sub);
  }

  /** Emite un JWT con claim `prv`: permisos efectivos = permisos del rol elegido + `auth:assume_role_preview`. */
  @Post('preview-role')
  @RequirePermissions('auth:assume_role_preview')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  previewRole(
    @CurrentUser() user: JwtUserPayload,
    @Body() dto: PreviewRoleDto,
    @Req() req: Request,
  ) {
    return this.auth.previewRole(user.sub, user.sid, dto.roleId, {
      ip: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
    });
  }

  /** Quita `prv` del token; permisos vuelven a los roles reales del usuario. */
  @Post('preview-role/clear')
  @RequirePermissions('auth:assume_role_preview')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  clearPreviewRole(@CurrentUser() user: JwtUserPayload, @Req() req: Request) {
    return this.auth.clearPreviewRole(user.sub, user.sid, {
      ip: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
    });
  }
}
