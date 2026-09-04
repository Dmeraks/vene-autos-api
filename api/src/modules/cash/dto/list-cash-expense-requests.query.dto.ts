/**
 * Filtro opcional de listado. Solo roles elevados pueden listar estados ajenos a su bandeja global;
 * el servicio aplica visibilidad según actor.
 */
import { IsIn, IsOptional } from 'class-validator';

const STATUS_VALUES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED'] as const;

export type CashExpenseRequestStatusQuery = (typeof STATUS_VALUES)[number];

export class ListCashExpenseRequestsQueryDto {
  @IsOptional()
  @IsIn([...STATUS_VALUES])
  status?: CashExpenseRequestStatusQuery;
}
