import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
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

  /** Costo por unidad de inventario (cantidad ya en esa unidad). No combinar con `lineTotalCost`. */
  @ValidateIf((o: PurchaseReceiptLineInputDto) => !o.lineTotalCost?.trim())
  @IsOptional()
  @IsString()
  @Matches(MONEY_DECIMAL_REGEX, {
    message: 'Costo unitario: solo pesos enteros en dígitos, sin decimales',
  })
  unitCost?: string;

  /** Total pagado por la cantidad de la línea (ej. caneca completa). No combinar con `unitCost`. */
  @ValidateIf((o: PurchaseReceiptLineInputDto) => !o.unitCost?.trim())
  @IsOptional()
  @IsString()
  @Matches(MONEY_DECIMAL_REGEX, {
    message: 'Costo total de línea: solo pesos enteros en dígitos, sin decimales',
  })
  lineTotalCost?: string;
}

export class CreatePurchaseReceiptDto {
  @IsString()
  @MaxLength(4000)
  note!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  supplierReference?: string;

  /** `CASH_REGISTER`: egreso en caja física (sesión abierta). `BANK_TRANSFER`: no mueve caja. */
  @IsOptional()
  @IsIn(['CASH_REGISTER', 'BANK_TRANSFER'])
  paymentSource?: 'CASH_REGISTER' | 'BANK_TRANSFER';

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PurchaseReceiptLineInputDto)
  lines!: PurchaseReceiptLineInputDto[];
}
