import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { IsPrismaCuid } from '../../../common/decorators/is-prisma-cuid.decorator';

export class CreateVehicleDto {
  @IsPrismaCuid()
  customerId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20)
  plate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  vin?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  brand?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  model?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  @Max(2100)
  year?: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  color?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;
}
