import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ReceiptsModule } from '../receipts/receipts.module';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

@Module({
  imports: [AuditModule, ReceiptsModule],
  controllers: [SettingsController],
  providers: [SettingsService],
})
export class SettingsModule {}
