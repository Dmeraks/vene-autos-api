import { IsBoolean, IsInt, IsNumber, IsString, Max, MaxLength, Min, MinLength, IsOptional } from 'class-validator';
import { Transform, Type } from 'class-transformer';

/** Acepta número o string numérico (p. ej. desde formularios) sin romper validación. */
export function toNumberLoose(value: unknown): unknown {
  if (value === '' || value === null || value === undefined) return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : value;
  if (typeof value === 'string') {
    const n = Number(value.replace(',', '.').trim());
    return Number.isFinite(n) ? n : value;
  }
  return value;
}

export class CreateWorkshopReserveLineDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @Transform(({ value }) => toNumberLoose(value))
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  @Max(100)
  percent!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;
}
