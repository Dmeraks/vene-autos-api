import { IsString, Matches } from 'class-validator';
import { DATE_ONLY_REGEX } from '../payroll.constants';

/** Body para recalcular una semana concreta. */
export class PayrollRecalculateDto {
  @IsString()
  @Matches(DATE_ONLY_REGEX, {
    message: 'weekStart: formato YYYY-MM-DD (lunes UTC)',
  })
  weekStart!: string;
}
