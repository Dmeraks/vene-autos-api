import { WorkOrderStatus } from '@prisma/client';
import { IsIn, IsOptional } from 'class-validator';

const STATUSES = Object.values(WorkOrderStatus);

export class ListWorkOrdersQueryDto {
  @IsOptional()
  @IsIn(STATUSES)
  status?: WorkOrderStatus;
}
