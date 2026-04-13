import { WorkOrderLineType } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { MONEY_DECIMAL_REGEX } from '../../cash/cash.constants';
import { QTY_DECIMAL_REGEX } from '../../inventory/inventory.constants';

export class CreateWorkOrderLineDto {
  @IsEnum(WorkOrderLineType)
  lineType!: WorkOrderLineType;

  @ValidateIf((o) => o.lineType === 'PART')
  @IsUUID()
  inventoryItemId?: string;

  @ValidateIf((o) => o.lineType === 'LABOR')
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  description?: string;

  @IsString()
  @MinLength(1)
  @Matches(QTY_DECIMAL_REGEX, {
    message: 'Cantidad inválida (entero o hasta 4 decimales)',
  })
  quantity!: string;

  @IsOptional()
  @IsString()
  @Matches(MONEY_DECIMAL_REGEX, { message: 'Precio unitario inválido' })
  unitPrice?: string;
}
