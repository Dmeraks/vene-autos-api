/** Apertura de caja: monto inicial en caja (string decimal) y nota opcional para bitácora humana. */
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { MONEY_DECIMAL_REGEX } from '../cash.constants';

export class OpenCashSessionDto {
  @IsString()
  @Matches(MONEY_DECIMAL_REGEX, {
    message: 'openingAmount debe ser un decimal positivo con máximo 2 decimales',
  })
  openingAmount!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
