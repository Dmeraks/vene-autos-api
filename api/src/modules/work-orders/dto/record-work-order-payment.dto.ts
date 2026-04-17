import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { MONEY_DECIMAL_REGEX } from '../../cash/cash.constants';

/** Registra un cobro en caja asociado a la OT (crea ingreso + fila de cobro en una transacción). */
export class RecordWorkOrderPaymentDto {
  /**
   * `partial`: abono; no cambia el estado de la OT.
   * `full`: liquidación del saldo pendiente; marca la OT como entregada y bloquea edición hasta reapertura.
   */
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

  /** Obligatoria; longitud mínima según `notes.min_length.work_order_payment` (ver `docs/NOTAS_POLITICA.md`). */
  @IsString()
  @MaxLength(2000)
  note!: string;

  /** Por defecto `ingreso_cobro`; debe ser categoría de ingreso existente. */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  categorySlug?: string;

  /** Opcional. Efectivo que entrega el cliente; debe ser ≥ `amount`. Vuelto = tender − amount. */
  @Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? undefined : value))
  @IsOptional()
  @IsString()
  @Matches(MONEY_DECIMAL_REGEX, {
    message: 'tenderAmount: solo pesos enteros en dígitos, sin decimales (ej. "150000")',
  })
  tenderAmount?: string;
}
