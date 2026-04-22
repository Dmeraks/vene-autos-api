import {
  Allow,
  IsBoolean,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { IsPrismaCuid } from '../../../common/decorators/is-prisma-cuid.decorator';

/**
 * Alta de orden: nace en UNASSIGNED sin técnico asignado.
 * Sin `parentWorkOrderId`, debe enviarse `vehicleId` (vehículo activo en maestro). Con garantía, el vehículo puede heredarse de la OT origen.
 */
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
  @Allow()
  @ValidateIf((_, v) => v != null && String(v).trim() !== '')
  @IsEmail()
  @MaxLength(120)
  customerEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  vehiclePlate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  vehicleBrand?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  vehicleModel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  vehicleLine?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  vehicleCylinderCc?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  vehicleColor?: string;

  @IsOptional()
  @ValidateIf((_, v) => v != null)
  @IsInt()
  @Min(0)
  @Max(9_999_999)
  intakeOdometerKm?: number | null;

  @IsOptional()
  @IsBoolean()
  inspectionOnly?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  vehicleNotes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  internalNotes?: string;

  /** Vehículo del maestro (obligatorio salvo alta de garantía con `parentWorkOrderId`, donde puede heredarse de la origen). */
  @ValidateIf((o: CreateWorkOrderDto) => !(o.parentWorkOrderId ?? '').trim())
  @IsNotEmpty({ message: 'Debés vincular la orden a un vehículo registrado (vehicleId).' })
  @IsPrismaCuid()
  vehicleId?: string;

  /** OT origen (debe estar **Entregada**). Crea una orden de garantía o seguimiento vinculada. */
  @IsOptional()
  @IsPrismaCuid()
  parentWorkOrderId?: string;

}
