import { DebitNoteReason, InvoiceLineType, TaxRateKind } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { MONEY_DECIMAL_REGEX } from '../../cash/cash.constants';

/**
 * Formato de cantidad decimal: hasta 4 decimales. Igual que SaleLineDto.
 * Se deja permisivo (e.g. "1", "2.5", "0.25") para insumos por galón u hora.
 */
const QUANTITY_REGEX = /^\d+(\.\d{1,4})?$/;

/** Porcentaje de impuesto: 0..100 con hasta 2 decimales ("0", "19", "8.00"). */
const TAX_PERCENT_REGEX = /^\d{1,3}(\.\d{1,2})?$/;

export class CreateDebitNoteLineDto {
  @IsEnum(InvoiceLineType)
  lineType!: InvoiceLineType;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  description!: string;

  @IsString()
  @Matches(QUANTITY_REGEX, { message: 'Cantidad inválida. Use hasta 4 decimales.' })
  quantity!: string;

  @IsString()
  @Matches(MONEY_DECIMAL_REGEX, {
    message: 'Precio unitario: solo pesos enteros en dígitos, sin decimales (ej. "150000").',
  })
  unitPrice!: string;

  @IsOptional()
  @IsString()
  @Matches(MONEY_DECIMAL_REGEX, {
    message: 'Descuento: solo pesos enteros en dígitos, sin decimales (ej. "5000").',
  })
  discountAmount?: string;

  @IsOptional()
  @IsString()
  @Matches(TAX_PERCENT_REGEX, {
    message: 'Porcentaje de impuesto inválido (0..100, hasta 2 decimales).',
  })
  taxRatePercent?: string;

  @IsOptional()
  @IsEnum(TaxRateKind)
  taxKind?: TaxRateKind;
}

/**
 * Crea una nota débito contra una factura emitida.
 *
 * Casos típicos:
 *  - `PRICE_CORRECTION`: la factura se emitió con precio menor al real.
 *  - `ADDITIONAL_CHARGE`: recargo posterior (mora, transporte, repuesto adicional).
 *  - `INTEREST`: intereses de mora.
 *
 * Al emitirse (ISSUED) la DN se suma al saldo cobrable de la factura, reabriendo
 * el cobro en caja si la factura ya estaba saldada.
 */
export class CreateDebitNoteDto {
  @IsEnum(DebitNoteReason)
  reason!: DebitNoteReason;

  @IsString()
  @MinLength(5, { message: 'Describe el motivo de la nota débito (mínimo 5 caracteres).' })
  @MaxLength(2000)
  reasonDescription!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  fiscalResolutionId?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'La nota débito requiere al menos una línea.' })
  @ValidateNested({ each: true })
  @Type(() => CreateDebitNoteLineDto)
  lines!: CreateDebitNoteLineDto[];
}
