import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { CashAccessService } from '../cash/cash-access.service';
import { PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [PayrollController],
  providers: [PayrollService, CashAccessService],
  exports: [PayrollService],
})
export class PayrollModule {}
