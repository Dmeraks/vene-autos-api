import { WorkOrderStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { IsPrismaCuid } from '../../../common/decorators/is-prisma-cuid.decorator';

const STATUSES = Object.values(WorkOrderStatus);

export class ListWorkOrdersQueryDto {
  @IsOptional()
  @IsIn(STATUSES)
  status?: WorkOrderStatus;

  @IsOptional()
  @IsPrismaCuid()
  vehicleId?: string;

  /** Todas las OT cuyo vehículo pertenezca a este cliente (cualquier unidad del maestro). */
  @IsOptional()
  @IsPrismaCuid()
  customerId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  /** Cache-bust del cliente; no se usa en el servidor (`forbidNonWhitelisted` lo exige explícito). */
  @IsOptional()
  @IsString()
  _?: string;
}
