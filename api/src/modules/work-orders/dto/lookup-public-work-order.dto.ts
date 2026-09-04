import { IsString, MaxLength, MinLength } from 'class-validator';

/** Cuerpo de `POST /work-orders/public/lookup` (sin JWT). */
export class LookupPublicWorkOrderDto {
  @IsString({ message: 'El código de la orden debe ser texto.' })
  @MinLength(5, { message: 'El código del comprobante es demasiado corto (usá el formato VEN-0001).' })
  @MaxLength(32, { message: 'El código del comprobante no puede superar 32 caracteres.' })
  publicCode!: string;

  @IsString({ message: 'La placa debe ser texto.' })
  @MinLength(1, { message: 'Ingresá la placa del vehículo.' })
  @MaxLength(24, { message: 'La placa ingresada es demasiado larga.' })
  plate!: string;
}
