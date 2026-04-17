import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { MONEY_DECIMAL_REGEX } from '../../cash/cash.constants';

export class CreateServiceDto {
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  @Matches(/^[A-Z0-9][A-Z0-9_-]*$/, {
    message:
      'Código: letras mayúsculas/dígitos/guiones (ej. SRV-DIAG). Debe empezar con letra o dígito.',
  })
  code!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  /** Precio sugerido en COP (entero). Opcional: se puede fijar al agregar el servicio a la OT. */
  @IsOptional()
  @IsString()
  @Matches(MONEY_DECIMAL_REGEX, {
    message: 'Precio sugerido: solo pesos enteros en dígitos, sin decimales',
  })
  defaultUnitPrice?: string;

  /** Id de la tarifa de impuesto sugerida (típicamente IVA 19%). */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  defaultTaxRateId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  sortOrder?: number;
}
