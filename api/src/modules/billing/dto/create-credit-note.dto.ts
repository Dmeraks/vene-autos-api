import { CreditNoteReason } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Crea una nota crédito contra una factura emitida (ISSUED).
 *
 * MVP: la NC **refleja íntegra** la factura (anula o corrige el 100%). En
 * iteraciones siguientes se podrán seleccionar líneas parciales.
 */
export class CreateCreditNoteDto {
  @IsEnum(CreditNoteReason)
  reason!: CreditNoteReason;

  @IsString()
  @MinLength(5, { message: 'Describe el motivo de la nota crédito (mínimo 5 caracteres).' })
  @MaxLength(2000)
  reasonDescription!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  fiscalResolutionId?: string;
}
