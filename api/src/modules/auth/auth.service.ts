import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
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

  private async roleSlugsForUser(userId: string): Promise<string[]> {
    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { roles: { select: { role: { select: { slug: true } } } } },
    });
    return row?.roles.map((ur) => ur.role.slug) ?? [];
  }

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
    const token = await this.signAccessToken(payload.sub, sid, undefined);
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
    const roleSlugs = await this.roleSlugsForUser(payload.sub);
    return {
      accessToken: token,
      tokenType: 'Bearer' as const,
      user: {
        id: payload.sub,
        email: payload.email,
        fullName: payload.fullName,
        permissions: payload.permissions,
        roleSlugs,
        portalCustomerId: payload.portalCustomerId ?? null,
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
    const token = await this.signAccessToken(payload.sub, sid, undefined);

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

    const roleSlugs = await this.roleSlugsForUser(payload.sub);
    return {
      accessToken: token,
      tokenType: 'Bearer' as const,
      user: {
        id: payload.sub,
        email: payload.email,
        fullName: payload.fullName,
        permissions: payload.permissions,
        roleSlugs,
        portalCustomerId: payload.portalCustomerId ?? null,
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

  private async signAccessToken(
    userId: string,
    sessionId: string,
    previewRoleId?: string | null,
  ): Promise<string> {
    const body: { sub: string; sid: string; prv?: string } = { sub: userId, sid: sessionId };
    if (previewRoleId) {
      body.prv = previewRoleId;
    }
    return this.jwt.signAsync(body);
  }

  private static readonly PREVIEW_KEEPER = 'auth:assume_role_preview';

  private async assertActorMayPreviewRoles(actorUserId: string): Promise<void> {
    const u = await this.prisma.user.findUnique({
      where: { id: actorUserId },
      include: { roles: { include: { role: { select: { slug: true } } } } },
    });
    if (!u?.isActive) {
      throw new UnauthorizedException('Sesión inválida');
    }
    const ok = u.roles.some((r) => r.role.slug === 'administrador' || r.role.slug === 'dueno');
    if (!ok) {
      throw new ForbiddenException('Solo administrador o dueño pueden usar la vista por rol.');
    }
  }

  async listPreviewRoleCandidates(actorUserId: string) {
    await this.assertActorMayPreviewRoles(actorUserId);
    return this.prisma.role.findMany({
      select: { id: true, name: true, slug: true, isSystem: true },
      orderBy: { name: 'asc' },
    });
  }

  async previewRole(
    actorUserId: string,
    sessionId: string,
    roleId: string,
    meta: { ip?: string; userAgent?: string },
  ) {
    await this.assertActorMayPreviewRoles(actorUserId);
    const role = await this.prisma.role.findUnique({
      where: { id: roleId },
      include: { permissions: { include: { permission: true } } },
    });
    if (!role) {
      throw new NotFoundException('Rol no encontrado');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: actorUserId },
      select: { id: true, email: true, fullName: true, portalCustomerId: true },
    });
    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado');
    }
    const set = new Set<string>();
    for (const rp of role.permissions) {
      set.add(permissionCode(rp.permission.resource, rp.permission.action));
    }
    set.add(AuthService.PREVIEW_KEEPER);
    const permissions = [...set].sort();
    const token = await this.signAccessToken(actorUserId, sessionId, roleId);
    await this.audit.recordDomain({
      actorUserId,
      action: 'auth.preview_role_started',
      entityType: 'Role',
      entityId: role.id,
      previousPayload: null,
      nextPayload: { roleSlug: role.slug, roleName: role.name },
      ipAddress: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    });
    const roleSlugs = await this.roleSlugsForUser(actorUserId);
    return {
      accessToken: token,
      tokenType: 'Bearer' as const,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        permissions,
        roleSlugs,
        portalCustomerId: user.portalCustomerId ?? null,
        previewRole: { id: role.id, slug: role.slug, name: role.name },
      },
    };
  }

  async clearPreviewRole(actorUserId: string, sessionId: string, meta: { ip?: string; userAgent?: string }) {
    await this.assertActorMayPreviewRoles(actorUserId);
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: actorUserId },
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
    const base = this.toJwtPayload(user);
    const canPrev = user.roles.some(
      (ur) => ur.role.slug === 'administrador' || ur.role.slug === 'dueno',
    );
    const permSet = new Set(base.permissions);
    if (canPrev) {
      permSet.add(AuthService.PREVIEW_KEEPER);
    }
    const permissions = [...permSet].sort();
    const token = await this.signAccessToken(actorUserId, sessionId, null);
    const roleSlugs = user.roles.map((ur) => ur.role.slug);
    await this.audit.recordDomain({
      actorUserId,
      action: 'auth.preview_role_cleared',
      entityType: 'User',
      entityId: actorUserId,
      previousPayload: null,
      nextPayload: null,
      ipAddress: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    });
    return {
      accessToken: token,
      tokenType: 'Bearer' as const,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        permissions,
        roleSlugs,
        portalCustomerId: base.portalCustomerId ?? null,
      },
    };
  }

  private toJwtPayload(
    user: {
      id: string;
      email: string;
      fullName: string;
      portalCustomerId?: string | null;
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
      portalCustomerId: user.portalCustomerId ?? null,
    };
  }
}
