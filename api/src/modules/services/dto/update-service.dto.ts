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
import { MONEY_DECIMAL_REGEX } from '../../cash/cash.constants';

/**
 * `code` queda fijo tras crear para no romper referencias ni reportes.
 * Si hace falta cambiarlo, se desactiva la fila actual y se crea una nueva.
 */
export class UpdateServiceDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @IsString()
  @Matches(MONEY_DECIMAL_REGEX, {
    message: 'Precio sugerido: solo pesos enteros en dígitos, sin decimales',
  })
  defaultUnitPrice?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  defaultTaxRateId?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  sortOrder?: number;
}
