import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Genera una factura electrónica a partir de una venta confirmada.
 *
 * El body es opcional: si `fiscalResolutionId` no se envía, el servicio usa la
 * resolución DIAN default activa para `ELECTRONIC_INVOICE`.
 */
export class CreateInvoiceFromSaleDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  fiscalResolutionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  internalNotes?: string;
}
