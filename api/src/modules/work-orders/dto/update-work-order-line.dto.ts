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
  @Matches(MONEY_DECIMAL_REGEX, { message: 'Precio unitario inválido' })
  unitPrice?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  description?: string;
}
