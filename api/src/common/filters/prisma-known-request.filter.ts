/**
 * Evita respuestas 500 opacas cuando el schema de Prisma y la BD no coinciden
 * (p. ej. falta ejecutar `npm run db:migrate`).
 */
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaKnownRequestExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaKnownRequestExceptionFilter.name);

  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();

    if (exception.code === 'P2021' || exception.code === 'P2022') {
      this.logger.warn(
        `${exception.code} ${exception.message} — aplicá migraciones (npm run db:migrate en la raíz del repo).`,
      );
      res.status(HttpStatus.SERVICE_UNAVAILABLE).json({
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        message:
          'La base de datos no coincide con el esquema esperado (falta migración o columna). En el entorno del API ejecutá desde la raíz del repo: npm run db:migrate (con DATABASE_URL y DIRECT_URL configurados).',
        code: exception.code,
      });
      return;
    }

    this.logger.error(exception.message, exception.stack);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: `Error de base de datos (${exception.code}). Revisá los logs del API.`,
      code: exception.code,
    });
  }
}
