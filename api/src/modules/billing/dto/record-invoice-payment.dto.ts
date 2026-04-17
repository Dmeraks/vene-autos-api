import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { MONEY_DECIMAL_REGEX } from '../../cash/cash.constants';

/**
 * Cobro en caja asociado a una factura (Fase 5). Paralelo a `RecordSalePaymentDto`.
 *
 * - `partial`: abono, deja saldo pendiente.
 * - `full`: liquidación total; debe igualar el saldo pendiente exacto.
 *
 * La tarifa DIAN / CUFE no se altera: los pagos NO modifican la factura emitida,
 * solo reflejan el cobro en caja para trazabilidad.
 */
export class RecordInvoicePaymentDto {
  @IsString()
  @IsIn(['partial', 'full'], {
    message: 'paymentKind debe ser "partial" (abono) o "full" (pago total / liquidación).',
  })
  paymentKind!: 'partial' | 'full';

  @IsString()
  @MinLength(1)
  @Matches(MONEY_DECIMAL_REGEX, {
    message: 'Monto inválido: solo pesos enteros en dígitos, sin decimales (ej. "150000")',
  })
  amount!: string;

  @IsString()
  @MaxLength(2000)
  note!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  categorySlug?: string;

  @Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? undefined : value))
  @IsOptional()
  @IsString()
  @Matches(MONEY_DECIMAL_REGEX, {
    message: 'tenderAmount: solo pesos enteros en dígitos, sin decimales (ej. "150000")',
  })
  tenderAmount?: string;
}
