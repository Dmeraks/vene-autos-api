import { WorkOrderStatus } from '@prisma/client';
import {
  Allow,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { MONEY_DECIMAL_REGEX } from '../../cash/cash.constants';

const STATUSES = Object.values(WorkOrderStatus);

/** Actualización parcial; si se envía `status`, debe ser una transición válida desde el estado actual. */
export class UpdateWorkOrderDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(4000)
  description?: string;

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
  @IsIn(STATUSES)
  status?: WorkOrderStatus;

  @IsOptional()
  @Allow()
  @ValidateIf((_, v) => v != null)
  @IsUUID()
  assignedToId?: string | null;

  /** Tope de cobros; `null` quita el tope. */
  @IsOptional()
  @Allow()
  @ValidateIf((_, v) => v != null)
  @IsString()
  @Matches(MONEY_DECIMAL_REGEX, {
    message: 'Monto inválido: use entero o hasta 2 decimales (ej. "150000" o "150000.50")',
  })
  authorizedAmount?: string | null;
}
