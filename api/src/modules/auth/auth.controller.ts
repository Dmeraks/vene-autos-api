/**
 * Autenticación pública con límites de frecuencia (anti fuerza bruta / abuso de registro).
 */
import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import type { JwtUserPayload } from './types/jwt-user.payload';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
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
}
