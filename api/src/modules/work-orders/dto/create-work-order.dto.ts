import { IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';
import { MONEY_DECIMAL_REGEX } from '../../cash/cash.constants';

/** Alta de orden: siempre nace en RECEIVED en servicio; cliente/vehículo opcional en texto. */
export class CreateWorkOrderDto {
  @IsString()
  @MinLength(3)
  @MaxLength(4000)
  description!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  customerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  customerPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  vehiclePlate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  vehicleNotes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  internalNotes?: string;

  @IsOptional()
  @IsUUID()
  assignedToId?: string;

  /** Tope opcional de cobros en caja para esta OT (sin tope si se omite). */
  @IsOptional()
  @IsString()
  @Matches(MONEY_DECIMAL_REGEX, {
    message: 'Monto inválido: use entero o hasta 2 decimales (ej. "150000" o "150000.50")',
  })
  authorizedAmount?: string;
}
