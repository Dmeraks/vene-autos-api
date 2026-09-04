import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { MONEY_DECIMAL_REGEX } from '../../cash/cash.constants';

export class CreateWorkshopPayableDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  creditorName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @IsString()
  @Matches(MONEY_DECIMAL_REGEX, {
    message: 'initialAmount: solo pesos enteros COP',
  })
  initialAmount!: string;
}
