/**
 * Lógica compartida de “quién puede qué” en caja, sin acoplarse a controladores.
 * Centraliza consultas a roles y a la tabla `cash_expense_delegates`.
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CASH_ELEVATED_ROLE_SLUGS } from './cash.constants';

@Injectable()
export class CashAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /** Devuelve los slugs de todos los roles asignados al usuario (puede haber varios). */
  async getRoleSlugsForUser(userId: string): Promise<string[]> {
    const rows = await this.prisma.userRole.findMany({
      where: { userId },
      include: { role: { select: { slug: true } } },
    });
    return rows.map((r) => r.role.slug);
  }

  /** True si algún rol del usuario está en la lista de roles con privilegios plenos de caja. */
  isElevated(roleSlugs: string[]): boolean {
    return roleSlugs.some((s) =>
      (CASH_ELEVATED_ROLE_SLUGS as readonly string[]).includes(s),
    );
  }

  /** True si el usuario figura como delegado autorizado para registrar egresos. */
  async isExpenseDelegate(userId: string): Promise<boolean> {
    const d = await this.prisma.cashExpenseDelegate.findUnique({
      where: { userId },
    });
    return !!d;
  }
}
