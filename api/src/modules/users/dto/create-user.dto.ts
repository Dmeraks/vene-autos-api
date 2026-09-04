import { ArrayMinSize, IsArray, IsEmail, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  @MinLength(2)
  fullName!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  roleIds!: string[];

  /** Cliente del taller para usuarios con rol portal (ver solo OT de sus vehículos). */
  @IsOptional()
  @IsUUID()
  portalCustomerId?: string;
}
