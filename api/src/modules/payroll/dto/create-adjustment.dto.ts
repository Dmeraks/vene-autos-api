import { PayrollAdjustmentKind } from '@prisma/client';
import { IsEnum, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { MONEY_DECIMAL_REGEX } from '../payroll.constants';

/**
 * Ajuste manual sobre una corrida en DRAFT.
 * - `amount` se envía como monto POSITIVO entero en pesos.
 * - El signo efectivo sobre `totalToPay` lo decide el servidor según `kind`:
 *   BONUS, OTHER → suma; ADVANCE, DEDUCTION → resta.
 */
export class CreatePayrollAdjustmentDto {
  @IsEnum(PayrollAdjustmentKind)
  kind!: PayrollAdjustmentKind;

  @IsString()
  @Matches(MONEY_DECIMAL_REGEX, {
    message: 'amount: solo pesos enteros en dígitos (ej. "50000"). Siempre positivo.',
  })
  amount!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
