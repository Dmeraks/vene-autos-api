import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { CreateRoleDto } from './dto/create-role.dto';
import type { UpdateRoleDto } from './dto/update-role.dto';

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  findAll() {
    return this.prisma.role.findMany({
      orderBy: { name: 'asc' },
      include: {
        permissions: {
          include: { permission: true },
        },
      },
    });
  }

  async findOne(id: string) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: {
        permissions: { include: { permission: true } },
      },
    });
    if (!role) {
      throw new NotFoundException('Rol no encontrado');
    }
    return role;
  }

  async create(dto: CreateRoleDto, actorUserId: string, meta: { ip?: string; userAgent?: string }) {
    const slug = dto.slug.trim().toLowerCase();
    const exists = await this.prisma.role.findUnique({ where: { slug } });
    if (exists) {
      throw new ConflictException('El slug del rol ya existe');
    }

    const permCount = await this.prisma.permission.count({
      where: { id: { in: dto.permissionIds } },
    });
    if (permCount !== dto.permissionIds.length) {
      throw new BadRequestException('Uno o más permisos no existen');
    }

    const role = await this.prisma.$transaction(async (tx) => {
      const created = await tx.role.create({
        data: {
          name: dto.name.trim(),
          slug,
          description: dto.description?.trim(),
          isSystem: false,
        },
      });
      await tx.rolePermission.createMany({
        data: dto.permissionIds.map((permissionId) => ({
          roleId: created.id,
          permissionId,
        })),
        skipDuplicates: true,
      });
      return created;
    });

    await this.audit.recordDomain({
      actorUserId,
      action: 'roles.create',
      entityType: 'Role',
      entityId: role.id,
      previousPayload: null,
      nextPayload: { name: role.name, slug: role.slug, permissionIds: dto.permissionIds },
      ipAddress: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    });

    return this.findOne(role.id);
  }

  async update(
    id: string,
    dto: UpdateRoleDto,
    actorUserId: string,
    meta: { ip?: string; userAgent?: string },
  ) {
    const before = await this.prisma.role.findUnique({
      where: { id },
      include: { permissions: { select: { permissionId: true } } },
    });
    if (!before) {
      throw new NotFoundException('Rol no encontrado');
    }

    if (dto.permissionIds) {
      const permCount = await this.prisma.permission.count({
        where: { id: { in: dto.permissionIds } },
      });
      if (permCount !== dto.permissionIds.length) {
        throw new BadRequestException('Uno o más permisos no existen');
      }
    }

    const beforePerm = before.permissions.map((p) => p.permissionId).sort();

    await this.prisma.$transaction(async (tx) => {
      await tx.role.update({
        where: { id },
        data: {
          name: dto.name?.trim() ?? before.name,
          description: dto.description !== undefined ? dto.description.trim() : before.description,
        },
      });
      if (dto.permissionIds) {
        await tx.rolePermission.deleteMany({ where: { roleId: id } });
        await tx.rolePermission.createMany({
          data: dto.permissionIds.map((permissionId) => ({ roleId: id, permissionId })),
          skipDuplicates: true,
        });
      }
    });

    const after = await this.prisma.role.findUnique({
      where: { id },
      include: { permissions: { select: { permissionId: true } } },
    });

    await this.audit.recordDomain({
      actorUserId,
      action: 'roles.update',
      entityType: 'Role',
      entityId: id,
      previousPayload: {
        name: before.name,
        description: before.description,
        permissionIds: beforePerm,
      },
      nextPayload: {
        name: after?.name,
        description: after?.description,
        permissionIds: after?.permissions.map((p) => p.permissionId).sort() ?? [],
      },
      ipAddress: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    });

    return this.findOne(id);
  }

  async remove(id: string, actorUserId: string, meta: { ip?: string; userAgent?: string }) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) {
      throw new NotFoundException('Rol no encontrado');
    }
    if (role.isSystem) {
      throw new BadRequestException('No se puede eliminar un rol de sistema');
    }

    const assigned = await this.prisma.userRole.count({ where: { roleId: id } });
    if (assigned > 0) {
      throw new BadRequestException('No se puede eliminar un rol asignado a usuarios');
    }

    await this.prisma.role.delete({ where: { id } });

    await this.audit.recordDomain({
      actorUserId,
      action: 'roles.delete',
      entityType: 'Role',
      entityId: id,
      previousPayload: { name: role.name, slug: role.slug },
      nextPayload: null,
      ipAddress: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    });

    return { deleted: true, id };
  }
}
