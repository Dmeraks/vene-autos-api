import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { MONEY_DECIMAL_REGEX } from '../../cash/cash.constants';
import { QTY_DECIMAL_REGEX } from '../../inventory/inventory.constants';

export class UpdateWorkOrderLineDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @Matches(QTY_DECIMAL_REGEX, {
    message: 'Cantidad inválida (entero o hasta 4 decimales)',
  })
  quantity?: string;

  @IsOptional()
  @IsString()
  @Matches(MONEY_DECIMAL_REGEX, {
    message: 'Precio unitario: solo pesos enteros en dígitos, sin decimales',
  })
  unitPrice?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  description?: string;

  /** Vincular/desvincular un servicio del catálogo (solo tiene sentido en líneas LABOR). */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  serviceId?: string | null;

  /** Cambiar la tarifa de impuesto aplicada (null → quitar). */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  taxRateId?: string | null;

  /** Descuento de línea en COP enteros (null → quitar). */
  @IsOptional()
  @IsString()
  @Matches(MONEY_DECIMAL_REGEX, {
    message: 'Descuento: solo pesos enteros en dígitos, sin decimales',
  })
  discountAmount?: string | null;
}
