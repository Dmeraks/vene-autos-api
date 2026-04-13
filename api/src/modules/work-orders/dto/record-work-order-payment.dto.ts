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

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  /** Por defecto `ingreso_cobro`; debe ser categoría de ingreso existente. */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  categorySlug?: string;
}
