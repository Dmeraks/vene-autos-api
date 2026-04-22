import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { EmployeeCreditsController } from './employee-credits.controller';
import { EmployeeCreditsService } from './employee-credits.service';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [EmployeeCreditsController],
  providers: [EmployeeCreditsService],
})
export class EmployeeCreditsModule {}
