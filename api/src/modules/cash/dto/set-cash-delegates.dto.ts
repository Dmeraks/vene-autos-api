/**
 * Sustitución atómica de la lista de delegados: siempre se envía el conjunto deseado completo.
 * El tamaño máximo debe coincidir con `MAX_CASH_EXPENSE_DELEGATES` en validación de negocio.
 */
import { ArrayMaxSize, ArrayUnique, IsArray, IsString } from 'class-validator';

export class SetCashDelegatesDto {
  /** IDs de usuario (máximo 3). Reemplaza la lista completa. */
  @IsArray()
  @ArrayMaxSize(3)
  @ArrayUnique()
  @IsString({ each: true })
  userIds!: string[];
}
