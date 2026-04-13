/**
 * Alta de solicitud de egreso. No mueve caja hasta que un rol elevado apruebe con sesión abierta.
 */
import { IsDateString, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { MONEY_DECIMAL_REGEX } from '../cash.constants';

export class CreateCashExpenseRequestDto {
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

  /** Si se indica, la aprobación queda bloqueada después de esta fecha/hora (ISO 8601). */
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
