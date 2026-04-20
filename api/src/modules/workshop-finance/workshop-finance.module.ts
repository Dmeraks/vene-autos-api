import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CashModule } from '../cash/cash.module';
import { NotesPolicyModule } from '../../common/notes-policy/notes-policy.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { WorkshopFinanceController } from './workshop-finance.controller';
import { WorkshopFinanceService } from './workshop-finance.service';

@Module({
  imports: [PrismaModule, AuditModule, NotesPolicyModule, CashModule],
  controllers: [WorkshopFinanceController],
  providers: [WorkshopFinanceService],
})
export class WorkshopFinanceModule {}
