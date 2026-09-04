import { QuoteStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { IsPrismaCuid } from '../../../common/decorators/is-prisma-cuid.decorator';

const STATUSES = Object.values(QuoteStatus);

export class ListQuotesQueryDto {
  @IsOptional()
  @IsIn(STATUSES)
  status?: QuoteStatus;

  @IsOptional()
  @IsPrismaCuid()
  vehicleId?: string;

  @IsOptional()
  @IsPrismaCuid()
  customerId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @IsOptional()
  @IsString()
  _?: string;
}
