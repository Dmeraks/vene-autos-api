import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';

function resolveCorsOrigin(): boolean | string[] {
  const raw = process.env.CORS_ORIGIN?.trim();
  const isProd = process.env.NODE_ENV === 'production';

  if (raw === '*') {
    if (isProd) {
      // eslint-disable-next-line no-console
      console.warn(
        '[CORS] CORS_ORIGIN=* en producción deshabilitado por seguridad; defina orígenes explícitos.',
      );
      return false;
    }
    return true;
  }

  if (raw) {
    return raw.split(',').map((o) => o.trim()).filter(Boolean);
  }

  return isProd ? false : true;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  if (process.env.TRUST_PROXY === 'true') {
    app.getHttpAdapter().getInstance().set('trust proxy', 1);
  }

  if (process.env.HELMET_ENABLED !== 'false') {
    app.use(
      helmet({
        contentSecurityPolicy: false,
        crossOriginResourcePolicy: { policy: 'cross-origin' },
      }),
    );
  }

  app.setGlobalPrefix('api/v1');
  app.enableCors({
    origin: resolveCorsOrigin(),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Vene Autos API — http://localhost:${port}/api/v1`);
}

bootstrap();
