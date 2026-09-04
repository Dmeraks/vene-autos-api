/** Nota obligatoria del aprobador; longitud mínima según `notes.min_length_chars` en configuración. */
import { IsString, MaxLength } from 'class-validator';

export class ApproveCashExpenseRequestDto {
  @IsString()
  @MaxLength(2000)
  approvalNote!: string;
}
