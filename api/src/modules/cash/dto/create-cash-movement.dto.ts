/** Cuerpo para crear ingreso o egreso; el endpoint fija la dirección, el slug de categoría debe coincidir. */
import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { IsPrismaCuid } from '../../../common/decorators/is-prisma-cuid.decorator';
import { MONEY_DECIMAL_REGEX } from '../cash.constants';

export class CreateCashMovementDto {
  @IsString()
  @MaxLength(80)
  categorySlug!: string;

  @IsString()
  @Matches(MONEY_DECIMAL_REGEX, {
    message: 'amount: solo pesos enteros en dígitos, sin decimales (ej. "50000")',
  })
  amount!: string;

  /** Opcional. Efectivo entregado (ingreso) o total en mano (egreso). Debe ser ≥ `amount`. */
  @Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? undefined : value))
  @IsOptional()
  @IsString()
  @Matches(MONEY_DECIMAL_REGEX, {
    message: 'tenderAmount: solo pesos enteros en dígitos, sin decimales (ej. "50000")',
  })
  tenderAmount?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  referenceType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  referenceId?: string;

  @IsString()
  @MaxLength(2000)
  note!: string;

  /** Si se envía, fija `referenceType`/`referenceId` al enlace estándar con la orden (no mezclar con otro tipo). */
  @IsOptional()
  @IsPrismaCuid()
  workOrderId?: string;
}
