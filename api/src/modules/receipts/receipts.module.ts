import { Module } from '@nestjs/common';
import { ReceiptsService } from './receipts.service';
import { TicketBuilderService } from './ticket-builder.service';
import { WorkshopLogoService } from './workshop-logo.service';

@Module({
  providers: [ReceiptsService, TicketBuilderService, WorkshopLogoService],
  exports: [ReceiptsService, TicketBuilderService, WorkshopLogoService],
})
export class ReceiptsModule {}
