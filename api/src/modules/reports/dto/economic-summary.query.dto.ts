import { IsIn, IsOptional, Matches } from 'class-validator';

/** Rango inclusive en calendario UTC `YYYY-MM-DD`. */
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export type ReportGranularity = 'day' | 'week' | 'fortnight' | 'month';

export class EconomicSummaryQueryDto {
  @Matches(DAY, { message: 'from debe ser YYYY-MM-DD' })
  from!: string;

  @Matches(DAY, { message: 'to debe ser YYYY-MM-DD' })
  to!: string;

  @IsOptional()
  @IsIn(['day', 'week', 'fortnight', 'month'])
  granularity?: ReportGranularity;
}
