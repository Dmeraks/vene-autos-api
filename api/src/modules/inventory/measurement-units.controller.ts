/**
 * Catálogo de unidades de medida (lectura).
 */
import { Controller, Get } from '@nestjs/common';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { MeasurementUnitsService } from './measurement-units.service';

@Controller('inventory/measurement-units')
export class MeasurementUnitsController {
  constructor(private readonly units: MeasurementUnitsService) {}

  @Get()
  @RequirePermissions('measurement_units:read')
  list() {
    return this.units.list();
  }
}
