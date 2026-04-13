import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { MONEY_DECIMAL_REGEX } from '../../cash/cash.constants';
import { QTY_DECIMAL_REGEX } from '../inventory.constants';

export class PurchaseReceiptLineInputDto {
  @IsString()
  @MinLength(1)
  inventoryItemId!: string;

  @IsString()
  @MinLength(1)
  @Matches(QTY_DECIMAL_REGEX, {
    message: 'Cantidad inválida (entero o hasta 4 decimales)',
  })
  quantity!: string;

  @IsOptional()
  @IsString()
  @Matches(MONEY_DECIMAL_REGEX, { message: 'Costo unitario inválido' })
  unitCost?: string;
}

export class CreatePurchaseReceiptDto {
  @IsString()
  @MaxLength(4000)
  note!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  supplierReference?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PurchaseReceiptLineInputDto)
  lines!: PurchaseReceiptLineInputDto[];
}
