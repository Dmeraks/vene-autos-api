import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { permissionCode } from '../../common/constants/permission-code';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthSessionService } from './auth-session.service';
import type { JwtUserPayload } from './types/jwt-user.payload';
import type { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly sessions: AuthSessionService,
  ) {}

  async validateUserForLogin(
    email: string,
    password: string,
  ): Promise<Omit<JwtUserPayload, 'sid'>> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
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
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    return this.toJwtPayload(user);
  }

  async login(email: string, password: string, meta: { ip?: string; userAgent?: string }) {
    const payload = await this.validateUserForLogin(email, password);
    const sid = await this.sessions.createSessionForUser(payload.sub, {
      ip: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    });
    const token = await this.signAccessToken(payload.sub, sid);
    await this.audit.recordDomain({
      actorUserId: payload.sub,
      action: 'auth.login',
      entityType: 'User',
      entityId: payload.sub,
      previousPayload: null,
      nextPayload: { email: payload.email },
      ipAddress: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    });
    return {
      accessToken: token,
      tokenType: 'Bearer' as const,
      user: {
        id: payload.sub,
        email: payload.email,
        fullName: payload.fullName,
        permissions: payload.permissions,
      },
    };
  }

  async register(dto: RegisterDto, meta: { ip?: string; userAgent?: string }) {
    const allow = this.config.get<string>('ALLOW_PUBLIC_REGISTRATION') === 'true';
    if (!allow) {
      throw new ForbiddenException(
        'El registro público está deshabilitado. Los usuarios los da de alta personal autorizado desde el panel (no por autoregistro).',
      );
    }

    const email = dto.email.toLowerCase().trim();
    const exists = await this.prisma.user.findUnique({ where: { email } });
    if (exists) {
      throw new ConflictException('El correo ya está registrado');
    }

    if (dto.roleIds?.length) {
      const roleCount = await this.prisma.role.count({ where: { id: { in: dto.roleIds } } });
      if (roleCount !== dto.roleIds.length) {
        throw new BadRequestException('Uno o más roles no existen');
      }
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        fullName: dto.fullName.trim(),
        roles: dto.roleIds?.length
          ? {
              createMany: {
                data: dto.roleIds.map((roleId) => ({ roleId })),
                skipDuplicates: true,
              },
            }
          : undefined,
      },
    });

    const full = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
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

    const payload = this.toJwtPayload(full);
    const sid = await this.sessions.createSessionForUser(payload.sub, {
      ip: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    });
    const token = await this.signAccessToken(payload.sub, sid);

    await this.audit.recordDomain({
      actorUserId: payload.sub,
      action: 'auth.register',
      entityType: 'User',
      entityId: user.id,
      previousPayload: null,
      nextPayload: { email: user.email, fullName: user.fullName },
      ipAddress: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    });

    return {
      accessToken: token,
      tokenType: 'Bearer' as const,
      user: {
        id: payload.sub,
        email: payload.email,
        fullName: payload.fullName,
        permissions: payload.permissions,
      },
    };
  }

  async logout(userId: string, sessionId: string, meta: { ip?: string; userAgent?: string }) {
    await this.sessions.revokeSession(sessionId, userId);
    await this.audit.recordDomain({
      actorUserId: userId,
      action: 'auth.logout',
      entityType: 'UserAuthSession',
      entityId: sessionId,
      previousPayload: null,
      nextPayload: null,
      ipAddress: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    });
    return { ok: true as const };
  }

  private async signAccessToken(userId: string, sessionId: string): Promise<string> {
    return this.jwt.signAsync({ sub: userId, sid: sessionId });
  }

  private toJwtPayload(
    user: {
      id: string;
      email: string;
      fullName: string;
      roles: {
        role: {
          permissions: { permission: { resource: string; action: string } }[];
        };
      }[];
    },
  ): Omit<JwtUserPayload, 'sid'> {
    const set = new Set<string>();
    for (const ur of user.roles) {
      for (const rp of ur.role.permissions) {
        set.add(permissionCode(rp.permission.resource, rp.permission.action));
      }
    }
    return {
      sub: user.id,
      email: user.email,
      fullName: user.fullName,
      permissions: [...set].sort(),
    };
  }
}
