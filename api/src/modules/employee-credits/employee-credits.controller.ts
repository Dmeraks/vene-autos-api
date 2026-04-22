import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import type { JwtUserPayload } from '../auth/types/jwt-user.payload';
import { CreateEmployeeCreditLineDto } from './dto/create-employee-credit-line.dto';
import { UpdateEmployeeCreditLineDto } from './dto/update-employee-credit-line.dto';
import { EmployeeCreditsService } from './employee-credits.service';

@Controller('employee-credits')
export class EmployeeCreditsController {
  constructor(private readonly svc: EmployeeCreditsService) {}

  @Get('summary')
  @RequirePermissions('employee_credits:read')
  summary() {
    return this.svc.summary();
  }

  @Get('debtor-candidates')
  @RequirePermissions('employee_credits:manage')
  debtorCandidates() {
    return this.svc.listDebtorCandidates();
  }

  @Get('lines/:debtorUserId')
  @RequirePermissions('employee_credits:read')
  lines(@Param('debtorUserId') debtorUserId: string) {
    return this.svc.listLines(debtorUserId);
  }

  @Post('lines')
  @RequirePermissions('employee_credits:manage')
  createLine(
    @Body() dto: CreateEmployeeCreditLineDto,
    @CurrentUser() user: JwtUserPayload | undefined,
    @Req() req: Request,
  ) {
    if (!user?.sub) throw new UnauthorizedException('Sesión no válida.');
    return this.svc.createLine(user.sub, dto, req);
  }

  @Patch('lines/:id')
  @RequirePermissions('employee_credits:manage')
  updateLine(
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeCreditLineDto,
    @CurrentUser() user: JwtUserPayload | undefined,
    @Req() req: Request,
  ) {
    if (!user?.sub) throw new UnauthorizedException('Sesión no válida.');
    return this.svc.updateLine(user.sub, id, dto, req);
  }

  @Delete('lines/:id')
  @RequirePermissions('employee_credits:manage')
  voidLine(@Param('id') id: string, @CurrentUser() user: JwtUserPayload | undefined, @Req() req: Request) {
    if (!user?.sub) throw new UnauthorizedException('Sesión no válida.');
    return this.svc.voidLine(user.sub, id, req);
  }
}
