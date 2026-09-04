import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { MONEY_DECIMAL_REGEX } from '../../cash/cash.constants';
import { QTY_DECIMAL_REGEX } from '../../inventory/inventory.constants';

export class UpdateQuoteLineDto {
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
  @MinLength(1)
  @MaxLength(128)
  taxRateId?: string | null;

  @IsOptional()
  @IsString()
  @Matches(MONEY_DECIMAL_REGEX, {
    message: 'Descuento: solo pesos enteros en dígitos, sin decimales',
  })
  discountAmount?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  description?: string | null;
}
