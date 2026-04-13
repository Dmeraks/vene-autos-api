import { Controller, Get, Query } from '@nestjs/common';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { EconomicSummaryQueryDto } from './dto/economic-summary.query.dto';
import { ReportsService } from './reports.service';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('economic-summary')
  @RequirePermissions('reports:read')
  economicSummary(@Query() query: EconomicSummaryQueryDto) {
    return this.reports.economicSummary(query);
  }
}
