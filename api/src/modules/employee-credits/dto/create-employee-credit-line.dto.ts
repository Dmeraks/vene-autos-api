import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { MONEY_DECIMAL_REGEX } from '../../cash/cash.constants';

export class CreateEmployeeCreditLineDto {
  @IsString()
  @MinLength(16)
  @MaxLength(32)
  debtorUserId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  description!: string;

  @IsString()
  @Matches(MONEY_DECIMAL_REGEX, { message: 'amount: solo pesos enteros COP' })
  amount!: string;
}
