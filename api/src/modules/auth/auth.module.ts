import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuditModule } from '../audit/audit.module';
import { AuthSessionService } from './auth-session.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000,
        limit: 500,
      },
    ]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          // La caducidad por inactividad la marca la sesión en BD; el JWT puede vivir más (cierre al superar exp JWT).
          expiresIn: config.get<string>('JWT_EXPIRES_IN') ?? '12h',
        },
      }),
    }),
    AuditModule,
  ],
  controllers: [AuthController],
  providers: [AuthSessionService, AuthService, JwtStrategy],
  exports: [AuthService, AuthSessionService],
})
export class AuthModule {}
