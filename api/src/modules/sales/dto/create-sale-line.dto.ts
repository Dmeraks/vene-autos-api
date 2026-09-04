import { SaleLineType } from '@prisma/client';
import { IsEnum, IsOptional, IsString, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { MONEY_DECIMAL_REGEX } from '../../cash/cash.constants';
import { QTY_DECIMAL_REGEX } from '../../inventory/inventory.constants';

/**
 * Agrega una línea a una venta en borrador. Estructura paralela a `CreateWorkOrderLineDto`
 * para que la UI de POS pueda reutilizar los mismos formularios.
 */
export class CreateSaleLineDto {
  @IsEnum(SaleLineType)
  lineType!: SaleLineType;

  @ValidateIf((o) => o.lineType === 'PART')
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  inventoryItemId?: string;

  @ValidateIf((o) => o.lineType === 'LABOR')
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  description?: string;

  @IsString()
  @MinLength(1)
  @Matches(QTY_DECIMAL_REGEX, {
    message: 'Cantidad inválida (entero o hasta 4 decimales)',
  })
  quantity!: string;

  @IsOptional()
  @IsString()
  @Matches(MONEY_DECIMAL_REGEX, {
    message: 'Precio unitario: solo pesos enteros en dígitos, sin decimales',
  })
  unitPrice?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  serviceId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  taxRateId?: string;

  @IsOptional()
  @IsString()
  @Matches(MONEY_DECIMAL_REGEX, {
    message: 'Descuento: solo pesos enteros en dígitos, sin decimales',
  })
  discountAmount?: string;
}
