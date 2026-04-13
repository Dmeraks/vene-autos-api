/** Apertura de caja: monto inicial y nota obligatoria (bitácora; mínimo según configuración del taller). */
import { IsString, Matches, MaxLength } from 'class-validator';
import { MONEY_DECIMAL_REGEX } from '../cash.constants';

export class OpenCashSessionDto {
  @IsString()
  @Matches(MONEY_DECIMAL_REGEX, {
    message: 'openingAmount debe ser un decimal positivo con máximo 2 decimales',
  })
  openingAmount!: string;

  @IsString()
  @MaxLength(2000)
  note!: string;
}
