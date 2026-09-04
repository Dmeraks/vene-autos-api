/**
 * Catálogo de categorías de movimiento (sembradas por migración/seed).
 * Lectura acotada a quien ya puede ver estado de caja (`cash_sessions:read`).
 */
import { Controller, Get } from '@nestjs/common';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PrismaService } from '../../prisma/prisma.service';

@Controller('cash')
export class CashCategoriesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('categories')
  @RequirePermissions('cash_sessions:read')
  listCategories() {
    return this.prisma.cashMovementCategory.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }
}
