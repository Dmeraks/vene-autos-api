import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

/**
 * Actualización de una resolución DIAN.
 *
 * Regla dura: `nextNumber` **no** se puede retroceder por debajo del valor actual
 * (evita duplicar números asignados). Se valida en el servicio, no acá.
 */
export class UpdateFiscalResolutionDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  resolutionNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  @Matches(/^[A-Z0-9]+$/i, {
    message: 'prefix solo acepta letras y dígitos (sin espacios ni símbolos).',
  })
  prefix?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  rangeFrom?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  rangeTo?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  nextNumber?: number;

  @IsOptional()
  @ValidateIf((_, v) => v !== '' && v !== null)
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'validFrom debe tener formato YYYY-MM-DD.' })
  validFrom?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== '' && v !== null)
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'validUntil debe tener formato YYYY-MM-DD.' })
  validUntil?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  technicalKey?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  testSetId?: string | null;

  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}
