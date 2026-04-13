/** Cuerpo para crear ingreso o egreso; el endpoint fija la dirección, el slug de categoría debe coincidir. */
import { IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { MONEY_DECIMAL_REGEX } from '../cash.constants';

export class CreateCashMovementDto {
  @IsString()
  @MaxLength(80)
  categorySlug!: string;

  @IsString()
  @Matches(MONEY_DECIMAL_REGEX, {
    message: 'amount debe ser un decimal positivo con máximo 2 decimales',
  })
  amount!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  referenceType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  referenceId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  /** Si se envía, fija `referenceType`/`referenceId` al enlace estándar con la orden (no mezclar con otro tipo). */
  @IsOptional()
  @IsUUID()
  workOrderId?: string;
}
