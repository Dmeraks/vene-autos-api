/** Motivo visible para quien creó la solicitud y para auditoría. */
import { IsString, MaxLength } from 'class-validator';

export class RejectCashExpenseRequestDto {
  @IsString()
  @MaxLength(2000)
  rejectionReason!: string;
}
