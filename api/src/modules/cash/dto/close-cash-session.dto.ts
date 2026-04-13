/**
 * Cierre de caja: conteo físico y, si no cuadra con el esperado, nota obligatoria (`differenceNote`).
 */
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { MONEY_DECIMAL_REGEX } from '../cash.constants';

export class CloseCashSessionDto {
  @IsString()
  @Matches(MONEY_DECIMAL_REGEX, {
    message: 'closingCounted debe ser un decimal positivo con máximo 2 decimales',
  })
  closingCounted!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  differenceNote?: string;
}
