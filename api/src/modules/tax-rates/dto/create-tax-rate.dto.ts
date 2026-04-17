import { TaxRateKind } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/**
 * Porcentaje en texto (`"19"`, `"19.00"`, `"5"`, `"0"`), hasta 2 decimales.
 * Se guarda como Decimal(5,2). Rango 0–100.
 */
export const PERCENT_DECIMAL_REGEX = /^\d{1,3}(\.\d{1,2})?$/;

export class CreateTaxRateDto {
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  @Matches(/^[a-z0-9_]+$/, {
    message: 'El identificador solo admite minúsculas, dígitos y guion bajo (ej. iva_19)',
  })
  slug!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsEnum(TaxRateKind, { message: 'Tipo inválido (VAT o INC).' })
  kind!: TaxRateKind;

  @IsString()
  @Matches(PERCENT_DECIMAL_REGEX, { message: 'Porcentaje 0–100 con hasta 2 decimales' })
  ratePercent!: string;

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
