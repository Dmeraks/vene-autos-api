import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Anula una ND en DRAFT (o aceptada pero nunca cobrada). `reason` queda en auditoría.
 */
export class VoidDebitNoteDto {
  @IsString()
  @MinLength(5, { message: 'Describe el motivo de la anulación (mínimo 5 caracteres).' })
  @MaxLength(2000)
  reason!: string;
}
