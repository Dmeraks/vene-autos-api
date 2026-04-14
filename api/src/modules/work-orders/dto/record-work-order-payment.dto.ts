import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { MONEY_DECIMAL_REGEX } from '../../cash/cash.constants';

/** Registra un cobro en caja asociado a la OT (crea ingreso + fila de cobro en una transacción). */
export class RecordWorkOrderPaymentDto {
  @IsString()
  @MinLength(1)
  @Matches(MONEY_DECIMAL_REGEX, {
    message: 'Monto inválido: use entero o hasta 2 decimales (ej. "150000" o "150000.50")',
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
    message: 'tenderAmount debe ser un decimal positivo con máximo 2 decimales',
  })
  tenderAmount?: string;
}
