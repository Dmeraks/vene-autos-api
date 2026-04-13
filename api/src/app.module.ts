/**
 * Raíz de la aplicación Nest: carga módulos de dominio y registra guards/interceptores globales.
 */
import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';
import { SessionActivityInterceptor } from './common/interceptors/session-activity.interceptor';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { RolesModule } from './modules/roles/roles.module';
import { PermissionsModule } from './modules/permissions/permissions.module';
import { AuditModule } from './modules/audit/audit.module';
import { SettingsModule } from './modules/settings/settings.module';
import { CashModule } from './modules/cash/cash.module';
import { WorkOrdersModule } from './modules/work-orders/work-orders.module';
import { HealthController } from './health/health.controller';
import { RootController } from './root.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuditModule,
    AuthModule,
    UsersModule,
    RolesModule,
    PermissionsModule,
    SettingsModule,
    CashModule,
    WorkOrdersModule,
  ],
  controllers: [RootController, HealthController],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    { provide: APP_INTERCEPTOR, useClass: SessionActivityInterceptor },
  ],
})
export class AppModule {}
