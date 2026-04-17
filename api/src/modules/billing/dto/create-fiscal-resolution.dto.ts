import { FiscalResolutionKind } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
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
  ValidateIf,
} from 'class-validator';

/**
 * Alta de una resolución DIAN (autorización de rango de numeración).
 *
 * `nextNumber` es opcional al crear; si falta, se inicializa en `rangeFrom`.
 */
export class CreateFiscalResolutionDto {
  @IsEnum(FiscalResolutionKind)
  kind!: FiscalResolutionKind;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  resolutionNumber!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(16)
  @Matches(/^[A-Z0-9]+$/i, {
    message: 'prefix solo acepta letras y dígitos (sin espacios ni símbolos).',
  })
  prefix!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  rangeFrom!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  rangeTo!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  nextNumber?: number;

  /** YYYY-MM-DD (opcional). */
  @IsOptional()
  @ValidateIf((_, v) => v !== '' && v !== null)
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'validFrom debe tener formato YYYY-MM-DD.' })
  validFrom?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== '' && v !== null)
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'validUntil debe tener formato YYYY-MM-DD.' })
  validUntil?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  technicalKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  testSetId?: string;

  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
