import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** Repuesto no catalogado: en la misma operación se crea el ítem en inventario con SKU automático y stock 0. */
export class AdHocQuotePartDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;

  /** Slug de `measurement_units` (default `unit`). */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  measurementUnitSlug?: string;
}
