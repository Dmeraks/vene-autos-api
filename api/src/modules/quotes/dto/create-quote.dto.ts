import { Allow, IsEmail, IsOptional, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { IsPrismaCuid } from '../../../common/decorators/is-prisma-cuid.decorator';

export class CreateQuoteDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  description?: string;

  @IsOptional()
  @IsPrismaCuid()
  vehicleId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  customerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  customerPhone?: string;

  @IsOptional()
  @Allow()
  @ValidateIf((_, v) => v != null && String(v).trim() !== '')
  @IsEmail()
  @MaxLength(120)
  customerEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
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
  @MaxLength(8000)
  internalNotes?: string;

  /** ISO date (solo día) opcional; el cliente puede enviar `YYYY-MM-DD`. */
  @IsOptional()
  @IsString()
  @MaxLength(32)
  validUntil?: string;
}
