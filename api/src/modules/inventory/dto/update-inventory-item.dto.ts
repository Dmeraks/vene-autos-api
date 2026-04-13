import { IsBoolean, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { MONEY_DECIMAL_REGEX } from '../../cash/cash.constants';

export class UpdateInventoryItemDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(MONEY_DECIMAL_REGEX, { message: 'Costo promedio inválido' })
  averageCost?: string | null;

  @IsOptional()
  @IsBoolean()
  trackStock?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
