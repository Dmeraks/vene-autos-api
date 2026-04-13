import { WorkOrderStatus } from '@prisma/client';
import { IsIn, IsOptional, IsUUID } from 'class-validator';

const STATUSES = Object.values(WorkOrderStatus);

export class ListWorkOrdersQueryDto {
  @IsOptional()
  @IsIn(STATUSES)
  status?: WorkOrderStatus;

  @IsOptional()
  @IsUUID()
  vehicleId?: string;
}
