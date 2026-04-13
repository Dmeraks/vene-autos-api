import { IsBoolean, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { MONEY_DECIMAL_REGEX } from '../../cash/cash.constants';
import { QTY_DECIMAL_REGEX } from '../inventory.constants';

export class CreateInventoryItemDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  sku!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  /** Slug de unidad existente (ej. `unit`, `liter`, `meter`). */
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  measurementUnitSlug!: string;

  @IsOptional()
  @IsString()
  @Matches(QTY_DECIMAL_REGEX, {
    message: 'Cantidad inicial inválida (entero o hasta 4 decimales)',
  })
  initialQuantity?: string;

  @IsOptional()
  @IsString()
  @Matches(MONEY_DECIMAL_REGEX, { message: 'Costo promedio inválido' })
  averageCost?: string;

  @IsOptional()
  @IsBoolean()
  trackStock?: boolean;
}
