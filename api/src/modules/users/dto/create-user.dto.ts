import { ArrayMinSize, IsArray, IsEmail, IsString, MinLength } from 'class-validator';

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
}
