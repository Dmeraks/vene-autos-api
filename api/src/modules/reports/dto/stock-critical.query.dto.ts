import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Fase 8 · Stock crítico (snapshot actual, sin rango temporal).
 *
 * Devuelve los ítems activos con `trackStock=true` cuyo `quantityOnHand` es menor o igual
 * al umbral. El umbral por defecto viene del setting global `inventory.stock_critical_threshold`;
 * el caller puede sobreescribirlo con `?threshold=N`.
 */
export class StockCriticalQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'threshold debe ser un entero ≥ 0' })
  @Min(0)
  @Max(1_000_000)
  threshold?: number;
}
