import { ArrayMinSize, IsArray, IsBoolean, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  fullName?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  roleIds?: string[];

  /** Enlace portal: cliente cuyas OT puede ver el usuario (null = quitar). */
  @IsOptional()
  @IsUUID()
  portalCustomerId?: string | null;
}
