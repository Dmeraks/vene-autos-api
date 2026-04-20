import { IsEnum, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { WorkshopPayablePaymentMethod } from '@prisma/client';
import { MONEY_DECIMAL_REGEX } from '../../cash/cash.constants';

export class PayWorkshopPayableDto {
  @IsString()
  @Matches(MONEY_DECIMAL_REGEX)
  amount!: string;

  @IsEnum(WorkshopPayablePaymentMethod)
  method!: WorkshopPayablePaymentMethod;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
