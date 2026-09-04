/**
 * HTTP para nómina técnica (Fase 9).
 *
 * Permisos:
 * - `payroll:read`       → ver panel y detalle (comisión y total; sin montos de MO salvo que también calcule/pague/configure).
 * - `payroll:calculate`  → recalcular semana y editar ajustes (incluye ver base MO).
 * - `payroll:pay`        → ejecutar pago (dueño + cajero).
 * - `payroll:configure`  → editar % por técnico (sólo dueño/admin en la práctica).
 */
import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { IsPrismaCuid } from '../../common/decorators/is-prisma-cuid.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import type { JwtUserPayload } from '../auth/types/jwt-user.payload';
import { CreatePayrollAdjustmentDto } from './dto/create-adjustment.dto';
import { PayPayrollRunDto } from './dto/pay-run.dto';
import { PayrollRecalculateDto } from './dto/recalculate.dto';
import { UpdateTechnicianPayrollConfigDto } from './dto/update-technician-config.dto';
import { PayrollWeekQueryDto } from './dto/week-query.dto';
import { PayrollService } from './payroll.service';

class VoidRunDto {
  @IsString()
  @MaxLength(500)
  reason!: string;
}

class TechnicianConfigParamsDto {
  @IsPrismaCuid()
  userId!: string;
}

class RunIdParamsDto {
  @IsPrismaCuid()
  runId!: string;
}

class AdjustmentIdParamsDto {
  @IsPrismaCuid()
  runId!: string;

  @IsPrismaCuid()
  adjustmentId!: string;
}

@Controller('payroll')
export class PayrollController {
  constructor(private readonly payroll: PayrollService) {}

  // ------------------------------- Semanas -------------------------------

  @Get('weeks')
  @RequirePermissions('payroll:read')
  getWeek(@Query() query: PayrollWeekQueryDto, @CurrentUser() actor: JwtUserPayload) {
    return this.payroll.getWeekSummary(query.weekStart, actor.permissions);
  }

  @Post('weeks/recalculate')
  @RequirePermissions('payroll:calculate')
  recalculate(@Body() dto: PayrollRecalculateDto, @CurrentUser() actor: JwtUserPayload) {
    return this.payroll.recalculateWeek(actor.sub, dto.weekStart);
  }

  // ------------------------------- Corridas ------------------------------

  @Get('runs/:runId')
  @RequirePermissions('payroll:read')
  getRun(@Param() params: RunIdParamsDto, @CurrentUser() actor: JwtUserPayload) {
    return this.payroll.getRunDetail(params.runId, actor.permissions);
  }

  @Post('runs/:runId/adjustments')
  @RequirePermissions('payroll:calculate')
  addAdjustment(
    @Param() params: RunIdParamsDto,
    @Body() dto: CreatePayrollAdjustmentDto,
    @CurrentUser() actor: JwtUserPayload,
  ) {
    return this.payroll.addAdjustment(actor.sub, params.runId, dto);
  }

  @Delete('runs/:runId/adjustments/:adjustmentId')
  @RequirePermissions('payroll:calculate')
  removeAdjustment(@Param() params: AdjustmentIdParamsDto, @CurrentUser() actor: JwtUserPayload) {
    return this.payroll.removeAdjustment(actor.sub, params.runId, params.adjustmentId);
  }

  @Post('runs/:runId/pay')
  @RequirePermissions('payroll:pay')
  payRun(
    @Param() params: RunIdParamsDto,
    @Body() dto: PayPayrollRunDto,
    @CurrentUser() actor: JwtUserPayload,
    @Req() req: Request,
  ) {
    return this.payroll.payRun(actor.sub, params.runId, dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
    });
  }

  @Post('runs/:runId/void')
  @RequirePermissions('payroll:configure')
  voidRun(
    @Param() params: RunIdParamsDto,
    @Body() dto: VoidRunDto,
    @CurrentUser() actor: JwtUserPayload,
  ) {
    return this.payroll.voidRun(actor.sub, params.runId, dto.reason);
  }

  // ----------------------------- Configuración ---------------------------

  @Get('technicians/config')
  @RequirePermissions('payroll:configure')
  listTechnicians(@CurrentUser() actor: JwtUserPayload) {
    return this.payroll.listTechniciansConfig(actor.sub);
  }

  @Put('technicians/:userId/config')
  @RequirePermissions('payroll:configure')
  updateTechnicianConfig(
    @Param() params: TechnicianConfigParamsDto,
    @Body() dto: UpdateTechnicianPayrollConfigDto,
    @CurrentUser() actor: JwtUserPayload,
  ) {
    return this.payroll.updateTechnicianConfig(actor.sub, params.userId, dto);
  }
}

// Re-export para `class-validator` en DTOs inline que no están en archivo aparte.
// (evita tree-shaking de decoradores si el compilador se pone creativo).
void IsOptional;
void IsString;
void MaxLength;
