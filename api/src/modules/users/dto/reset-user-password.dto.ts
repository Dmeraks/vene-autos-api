import { IsString, MaxLength, MinLength } from 'class-validator';

/** Solo administración: los usuarios finales no tienen flujo de “cambiar mi contraseña”. */
export class ResetUserPasswordDto {
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;
}
