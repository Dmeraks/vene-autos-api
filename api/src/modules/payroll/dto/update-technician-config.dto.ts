import { Transform } from 'class-transformer';
import { IsBoolean, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** Configuración de nómina por técnico (solo dueño/admin). */
export class UpdateTechnicianPayrollConfigDto {
  /** 0 – 100, hasta 2 decimales. Ej: 50, 47.5, 100. */
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? Number(value) : value))
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  laborCommissionPct?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
