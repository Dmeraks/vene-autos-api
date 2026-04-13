/**
 * Renueva la marca de actividad de la sesión de acceso en cada petición autenticada.
 * Así el reloj de inactividad solo corre cuando no hay llamadas al API.
 */
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { Observable, from, mergeMap } from 'rxjs';
import type { JwtUserPayload } from '../../modules/auth/types/jwt-user.payload';
import { AuthSessionService } from '../../modules/auth/auth-session.service';

@Injectable()
export class SessionActivityInterceptor implements NestInterceptor {
  constructor(private readonly sessions: AuthSessionService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request & { user?: JwtUserPayload }>();
    const user = req.user;
    if (!user?.sid) {
      return next.handle();
    }

    return from(this.sessions.touchSession(user.sid, user.sub)).pipe(mergeMap(() => next.handle()));
  }
}
