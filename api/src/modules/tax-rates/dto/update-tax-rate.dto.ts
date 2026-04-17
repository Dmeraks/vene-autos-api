import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PERCENT_DECIMAL_REGEX } from './create-tax-rate.dto';

/**
 * Solo se actualizan campos mutables. `slug` y `kind` quedan fijos tras crear la fila
 * para no romper referencias ni cambiar el sentido fiscal (IVA vs INC).
 */
export class UpdateTaxRateDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(PERCENT_DECIMAL_REGEX, { message: 'Porcentaje 0–100 con hasta 2 decimales' })
  ratePercent?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  sortOrder?: number;
}
