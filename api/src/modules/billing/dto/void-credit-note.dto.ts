import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Anula una NC emitida localmente (DRAFT) o aceptada pero no utilizada. `reason`
 * queda guardado en la auditoría para trazabilidad.
 */
export class VoidCreditNoteDto {
  @IsString()
  @MinLength(5, { message: 'Describe el motivo de la anulación (mínimo 5 caracteres).' })
  @MaxLength(2000)
  reason!: string;
}
