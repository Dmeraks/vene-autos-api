import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Body para marcar como PAID una corrida (crea CashMovement EXPENSE). */
export class PayPayrollRunDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
