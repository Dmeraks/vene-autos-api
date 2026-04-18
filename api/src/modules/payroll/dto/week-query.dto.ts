import { IsOptional, IsString, Matches } from 'class-validator';
import { DATE_ONLY_REGEX } from '../payroll.constants';

/** Query para obtener el resumen de una semana: `?weekStart=YYYY-MM-DD` (lunes UTC). */
export class PayrollWeekQueryDto {
  @IsOptional()
  @IsString()
  @Matches(DATE_ONLY_REGEX, {
    message: 'weekStart: formato YYYY-MM-DD (lunes UTC)',
  })
  weekStart?: string;
}
