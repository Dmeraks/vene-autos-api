import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { SaleOrigin, SaleStatus } from '@prisma/client';
import { IsPrismaCuid } from '../../../common/decorators/is-prisma-cuid.decorator';

/**
 * Filtros de listado de ventas. Paginación por `page`/`pageSize` como en OT.
 * Por defecto devuelve todos los estados; si se envía `status`, filtra.
 */
export class ListSalesQueryDto {
  @IsOptional()
  @IsEnum(SaleStatus, {
    message: 'status debe ser DRAFT, CONFIRMED o CANCELLED',
  })
  status?: SaleStatus;

  @IsOptional()
  @IsEnum(SaleOrigin, {
    message: 'origin debe ser COUNTER o WORK_ORDER',
  })
  origin?: SaleOrigin;

  @IsOptional()
  @IsPrismaCuid()
  customerId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  publicCode?: string;

  @Transform(({ value }) => (value === undefined || value === '' ? undefined : Number(value)))
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10_000)
  page?: number;

  @Transform(({ value }) => (value === undefined || value === '' ? undefined : Number(value)))
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
