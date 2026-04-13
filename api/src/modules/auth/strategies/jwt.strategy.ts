/**
 * Valida JWT + sesión de servidor (`sid`), permisos y usuario activo.
 * La inactividad se controla con `last_activity_at` y el ajuste `auth.session_idle_timeout_minutes`.
 */
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { permissionCode } from '../../../common/constants/permission-code';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuthSessionService } from '../auth-session.service';
import type { JwtUserPayload } from '../types/jwt-user.payload';

/** Claims del token de acceso. */
type JwtBody = { sub: string; sid: string };

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: AuthSessionService,
    config: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtBody): Promise<JwtUserPayload> {
    if (!payload?.sub || !payload?.sid) {
      throw new UnauthorizedException('Token incompleto. Inicie sesión de nuevo.');
    }

    await this.sessions.assertSessionValid(payload.sid, payload.sub);

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        roles: {
          include: {
            role: {
              include: {
                permissions: { include: { permission: true } },
              },
            },
          },
        },
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Sesión inválida o usuario inactivo');
    }

    const set = new Set<string>();
    for (const ur of user.roles) {
      for (const rp of ur.role.permissions) {
        set.add(permissionCode(rp.permission.resource, rp.permission.action));
      }
    }

    return {
      sub: user.id,
      sid: payload.sid,
      email: user.email,
      fullName: user.fullName,
      permissions: [...set].sort(),
    };
  }
}
