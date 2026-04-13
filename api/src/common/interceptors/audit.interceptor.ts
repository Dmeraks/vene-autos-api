import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';
import type { JwtUserPayload } from '../../modules/auth/types/jwt-user.payload';
import { AuditService } from '../../modules/audit/audit.service';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Registra una línea de auditoría HTTP para métodos mutadores (cuerpo redactado). */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request & { user?: JwtUserPayload }>();
    const res = http.getResponse<Response>();

    if (!MUTATING.has(req.method)) {
      return next.handle();
    }

    const enabled = this.config.get<string>('AUDIT_HTTP') !== 'false';
    if (!enabled) {
      return next.handle();
    }

    const path = req.originalUrl ?? req.url;
    const actorUserId = req.user?.sub ?? null;

    return next.handle().pipe(
      tap({
        next: () => {
          const status = res.statusCode;
          if (status >= 200 && status < 300) {
            void this.audit.recordHttpEvent({
              actorUserId,
              method: req.method,
              path,
              statusCode: status,
              query: req.query,
              body: redactBody(req.body),
              requestId: (req.headers['x-request-id'] as string) ?? null,
              ipAddress: normalizeIp(req.ip ?? req.socket.remoteAddress),
              userAgent: (req.headers['user-agent'] as string) ?? null,
            });
          }
        },
      }),
    );
  }
}

function redactBody(body: unknown): unknown {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return body;
  }
  const clone: Record<string, unknown> = { ...(body as Record<string, unknown>) };
  for (const key of Object.keys(clone)) {
    const lower = key.toLowerCase();
    if (
      lower.includes('password') ||
      lower.includes('token') ||
      lower === 'authorization' ||
      lower.includes('secret')
    ) {
      clone[key] = '[REDACTED]';
      continue;
    }
    if (typeof clone[key] === 'object' && clone[key] !== null) {
      clone[key] = redactBody(clone[key]);
    }
  }
  return clone;
}

function normalizeIp(ip: string | undefined): string | null {
  if (!ip) {
    return null;
  }
  return ip === '::1' ? '127.0.0.1' : ip;
}
