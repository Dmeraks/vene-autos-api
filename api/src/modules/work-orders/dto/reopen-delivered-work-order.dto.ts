import { IsString, MaxLength } from 'class-validator';

/** Reapertura de una OT entregada (solo permiso elevado + nota y justificación). */
export class ReopenDeliveredWorkOrderDto {
  @IsString()
  @MaxLength(4000)
  note!: string;

  @IsString()
  @MaxLength(4000)
  justification!: string;
}
