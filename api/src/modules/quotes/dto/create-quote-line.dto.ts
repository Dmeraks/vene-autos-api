import { QuoteLineType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { MONEY_DECIMAL_REGEX } from '../../cash/cash.constants';
import { QTY_DECIMAL_REGEX } from '../../inventory/inventory.constants';
import { AdHocQuotePartDto } from './ad-hoc-quote-part.dto';

export class CreateQuoteLineDto {
  @IsEnum(QuoteLineType)
  lineType!: QuoteLineType;

  /** Catálogo existente (repuesto ya dado de alta). */
  @ValidateIf((o: CreateQuoteLineDto) => o.lineType === 'PART')
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  inventoryItemId?: string;

  /** Alta implícita en inventario (SKU consecutivo, stock 0). No combine con `inventoryItemId`. */
  @ValidateIf((o: CreateQuoteLineDto) => o.lineType === 'PART')
  @IsOptional()
  @ValidateNested()
  @Type(() => AdHocQuotePartDto)
  adHocPart?: AdHocQuotePartDto;

  @ValidateIf((o: CreateQuoteLineDto) => o.lineType === 'LABOR')
  @IsOptional()
  @IsString()
  @MinLength(1)
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
