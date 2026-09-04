import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Anular una factura en DRAFT (no aceptada por DIAN).
 *
 * Regla: si la factura ya está ISSUED (DIAN la aceptó), la corrección debe hacerse
 * vía NotaCrédito, no con void. El servicio lo valida.
 */
export class VoidInvoiceDto {
  @IsString()
  @MinLength(5, { message: 'Describe el motivo de anulación (mínimo 5 caracteres).' })
  @MaxLength(1000)
  reason!: string;
}
