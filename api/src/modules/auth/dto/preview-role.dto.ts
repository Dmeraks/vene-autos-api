import { IsString, MinLength } from 'class-validator';

export class PreviewRoleDto {
  @IsString()
  @MinLength(1)
  roleId!: string;
}
