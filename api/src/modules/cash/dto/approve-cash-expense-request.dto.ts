/** Nota opcional del aprobador (queda en la solicitud y se refleja en auditoría). */
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ApproveCashExpenseRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  approvalNote?: string;
}
