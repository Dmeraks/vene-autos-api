import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthSessionService } from '../auth/auth-session.service';
import type { CreateUserDto } from './dto/create-user.dto';
import type { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly authSessions: AuthSessionService,
  ) {}

  async findAll() {
    return this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        fullName: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        roles: {
          select: {
            role: { select: { id: true, name: true, slug: true } },
          },
        },
      },
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        fullName: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        roles: {
          select: {
            role: {
              select: {
                id: true,
                name: true,
                slug: true,
                permissions: {
                  select: {
                    permission: {
                      select: { id: true, resource: true, action: true, description: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }
    return user;
  }

  async create(dto: CreateUserDto, actorUserId: string, meta: { ip?: string; userAgent?: string }) {
    await this.assertActorMayCreateUsers(actorUserId);

    const email = dto.email.toLowerCase().trim();
    const exists = await this.prisma.user.findUnique({ where: { email } });
    if (exists) {
      throw new ConflictException('El correo ya existe');
    }

    const roleCount = await this.prisma.role.count({ where: { id: { in: dto.roleIds } } });
    if (roleCount !== dto.roleIds.length) {
      throw new BadRequestException('Uno o más roles no existen');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        fullName: dto.fullName.trim(),
        roles: {
          createMany: {
            data: dto.roleIds.map((roleId) => ({ roleId })),
            skipDuplicates: true,
          },
        },
      },
    });

    await this.audit.recordDomain({
      actorUserId,
      action: 'users.create',
      entityType: 'User',
      entityId: user.id,
      previousPayload: null,
      nextPayload: { email: user.email, fullName: user.fullName, roleIds: dto.roleIds },
      ipAddress: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    });

    return this.findOne(user.id);
  }

  async update(
    id: string,
    dto: UpdateUserDto,
    actorUserId: string,
    meta: { ip?: string; userAgent?: string },
  ) {
    const before = await this.prisma.user.findUnique({
      where: { id },
      include: {
        roles: { select: { roleId: true } },
      },
    });
    if (!before) {
      throw new NotFoundException('Usuario no encontrado');
    }

    if (dto.roleIds) {
      const roleCount = await this.prisma.role.count({ where: { id: { in: dto.roleIds } } });
      if (roleCount !== dto.roleIds.length) {
        throw new BadRequestException('Uno o más roles no existen');
      }
    }

    const data: {
      fullName?: string;
      isActive?: boolean;
    } = {};
    if (dto.fullName !== undefined) {
      data.fullName = dto.fullName.trim();
    }
    if (dto.isActive !== undefined) {
      data.isActive = dto.isActive;
    }

    await this.prisma.$transaction(async (tx) => {
      if (dto.roleIds) {
        await tx.userRole.deleteMany({ where: { userId: id } });
        await tx.userRole.createMany({
          data: dto.roleIds.map((roleId) => ({ userId: id, roleId })),
          skipDuplicates: true,
        });
      }
      if (Object.keys(data).length > 0) {
        await tx.user.update({ where: { id }, data });
      }
    });

    if (dto.isActive === false && before.isActive) {
      await this.authSessions.revokeAllForUser(id);
    }

    const after = await this.prisma.user.findUnique({
      where: { id },
      include: { roles: { select: { roleId: true } } },
    });

    await this.audit.recordDomain({
      actorUserId,
      action: 'users.update',
      entityType: 'User',
      entityId: id,
      previousPayload: {
        fullName: before.fullName,
        isActive: before.isActive,
        roleIds: before.roles.map((r) => r.roleId),
      },
      nextPayload: {
        fullName: after?.fullName,
        isActive: after?.isActive,
        roleIds: after?.roles.map((r) => r.roleId) ?? [],
      },
      ipAddress: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    });

    return this.findOne(id);
  }

  /**
   * Si `users.create_requires_dueno_role` es true en configuración, solo quien tenga el rol `dueno` puede dar altas.
   */
  private async assertActorMayCreateUsers(actorUserId: string): Promise<void> {
    const row = await this.prisma.workshopSetting.findUnique({
      where: { key: 'users.create_requires_dueno_role' },
    });
    const raw = row?.value;
    const requiresDueno = raw === true || raw === 'true';
    if (!requiresDueno) {
      return;
    }

    const links = await this.prisma.userRole.findMany({
      where: { userId: actorUserId },
      include: { role: { select: { slug: true } } },
    });
    const hasDueno = links.some((l) => l.role.slug === 'dueno');
    if (!hasDueno) {
      throw new ForbiddenException(
        'Solo el dueño (rol dueno) puede crear usuarios. Ajuste la configuración del taller o use una cuenta con ese rol.',
      );
    }
  }
}
