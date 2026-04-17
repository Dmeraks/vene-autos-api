import { IsEmail, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';
import { IsPrismaCuid } from '../../../common/decorators/is-prisma-cuid.decorator';

/**
 * Edita los snapshots de cliente y la nota interna en una venta **en borrador**.
 * No cambia líneas ni estado (usar endpoints específicos).
 *
 * Convención de borrado: `null` limpia el campo (lo deja vacío). `undefined` lo ignora.
 */
export class UpdateSaleDto {
  @ValidateIf((_, v) => v !== null)
  @IsOptional()
  @IsPrismaCuid()
  customerId?: string | null;

  @ValidateIf((_, v) => v !== null)
  @IsOptional()
  @IsString()
  @MaxLength(200)
  customerName?: string | null;

  @ValidateIf((_, v) => v !== null)
  @IsOptional()
  @IsString()
  @MaxLength(40)
  customerDocumentId?: string | null;

  @ValidateIf((_, v) => v !== null)
  @IsOptional()
  @IsString()
  @MaxLength(40)
  customerPhone?: string | null;

  @ValidateIf((_, v) => v !== null)
  @IsOptional()
  @IsEmail()
  @MaxLength(120)
  customerEmail?: string | null;

  @ValidateIf((_, v) => v !== null)
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  internalNotes?: string | null;
}
