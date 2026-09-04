import { IsString, MaxLength } from 'class-validator';

/** Cancela una venta confirmada que **no tenga cobros**: reintegra el inventario consumido. */
export class CancelSaleDto {
  /** Obligatoria. Se auditará. */
  @IsString()
  @MaxLength(2000)
  reason!: string;
}
