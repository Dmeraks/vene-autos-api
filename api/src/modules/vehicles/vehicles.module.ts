import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { WorkOrdersModule } from '../work-orders/work-orders.module';
import { VehiclesController } from './vehicles.controller';
import { VehiclesService } from './vehicles.service';

@Module({
  imports: [AuditModule, WorkOrdersModule],
  controllers: [VehiclesController],
  providers: [VehiclesService],
  exports: [VehiclesService],
})
export class VehiclesModule {}
