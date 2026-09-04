import { IsOptional, IsString, MaxLength } from 'class-validator';
import { IsPrismaCuid } from '../../../common/decorators/is-prisma-cuid.decorator';

/**
 * Crea una venta a partir de una OT ya entregada (`WorkOrderStatus.DELIVERED`).
 * Copia las líneas con sus snapshots (precio/impuesto/costo) y NO reconsume inventario
 * (la OT ya generó los movimientos `WORK_ORDER_CONSUMPTION`).
 *
 * Solo se permite una venta por OT (restricción UNIQUE en `sales.origin_work_order_id`).
 */
export class CreateSaleFromWorkOrderDto {
  @IsPrismaCuid()
  workOrderId!: string;

  /**
   * Si se omite, al confirmar se copian los snapshots del cliente desde la OT
   * (customerName/Email/Phone). Enviar estos campos permite corregir datos fiscales
   * antes de emitir el comprobante sin tocar la OT original.
   */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  customerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  customerDocumentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  customerPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  customerEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  internalNotes?: string;
}
