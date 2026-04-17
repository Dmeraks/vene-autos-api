/** Apertura de caja: monto inicial y nota obligatoria (bitácora; mínimo según configuración del taller). */
import { IsString, Matches, MaxLength } from 'class-validator';
import { MONEY_DECIMAL_REGEX } from '../cash.constants';

export class OpenCashSessionDto {
  @IsString()
  @Matches(MONEY_DECIMAL_REGEX, {
    message: 'openingAmount: solo pesos enteros en dígitos, sin decimales (ej. "500000")',
  })
  openingAmount!: string;

  @IsString()
  @MaxLength(2000)
  note!: string;
}
