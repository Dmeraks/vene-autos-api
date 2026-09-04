/**
 * Cierre de caja: conteo físico y, si no cuadra con el esperado, nota obligatoria (`differenceNote`).
 */
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { MONEY_DECIMAL_REGEX } from '../cash.constants';

export class CloseCashSessionDto {
  @IsString()
  @Matches(MONEY_DECIMAL_REGEX, {
    message: 'closingCounted: solo pesos enteros en dígitos, sin decimales (ej. "500000")',
  })
  closingCounted!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  differenceNote?: string;
}
