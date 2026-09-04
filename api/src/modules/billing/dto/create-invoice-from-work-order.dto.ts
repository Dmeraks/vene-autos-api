import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Genera una factura electrónica directamente desde una OT **entregada** (sin
 * pasar por `Sale`). Útil cuando el taller cobra al cliente en caja y no
 * necesita un comprobante de mostrador adicional.
 *
 * El body es opcional: si `fiscalResolutionId` no se envía, el servicio usa la
 * resolución DIAN default activa para `ELECTRONIC_INVOICE`.
 */
export class CreateInvoiceFromWorkOrderDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  fiscalResolutionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  internalNotes?: string;
}
