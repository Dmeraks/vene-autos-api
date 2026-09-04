import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Libro diario de movimientos de caja (Fase 6).
 *
 * Rango por `createdAt` del movimiento. `sessionId` opcional acota al arqueo de
 * una sesión específica. Se usa tanto para vista JSON como para export XLSX.
 */
export class CashJournalQueryDto {
  @Matches(DAY, { message: 'from debe ser YYYY-MM-DD' })
  from!: string;

  @Matches(DAY, { message: 'to debe ser YYYY-MM-DD' })
  to!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  sessionId?: string;
}
