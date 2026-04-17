import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';
import { IsPrismaCuid } from '../../../common/decorators/is-prisma-cuid.decorator';

/**
 * Crea una venta en estado `DRAFT` de origen `COUNTER` (mostrador).
 * Para facturar una OT ya entregada usá `POST /sales/from-work-order`.
 *
 * Todos los campos del cliente son snapshots: si el maestro cambia después de confirmar,
 * el comprobante mantiene la información original.
 */
export class CreateSaleDto {
  /** Cliente del maestro (opcional; si se envía, los snapshots se rellenan automáticamente si van vacíos). */
  @IsOptional()
  @IsPrismaCuid()
  customerId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  customerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  customerDocumentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  customerPhone?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(120)
  customerEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  internalNotes?: string;
}
