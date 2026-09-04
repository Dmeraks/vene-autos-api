import { WorkOrderLineType } from '@prisma/client';
import { IsEnum, IsOptional, IsString, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { MONEY_DECIMAL_REGEX } from '../../cash/cash.constants';
import { QTY_DECIMAL_REGEX } from '../../inventory/inventory.constants';

export class CreateWorkOrderLineDto {
  @IsEnum(WorkOrderLineType)
  lineType!: WorkOrderLineType;

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

  /** Servicio del catálogo (opcional). Solo aplica a líneas LABOR; si viene, se puede omitir description (el servicio la aporta). */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  serviceId?: string;

  /** Tarifa de impuesto aplicada a la línea (opcional mientras no esté activa la facturación). */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  taxRateId?: string;

  /** Descuento de línea en COP enteros (no porcentaje). */
  @IsOptional()
  @IsString()
  @Matches(MONEY_DECIMAL_REGEX, {
    message: 'Descuento: solo pesos enteros en dígitos, sin decimales',
  })
  discountAmount?: string;
}
