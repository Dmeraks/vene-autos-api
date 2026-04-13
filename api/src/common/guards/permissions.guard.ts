/**
 * Guard global que aplica permisos declarados con `@RequirePermissions(...)`.
 *
 * Flujo: rutas `@Public()` pasan sin revisar permisos; si no hay requisitos explícitos en el
 * handler/clase, se permite (útil para endpoints solo autenticados). Si hay códigos requeridos,
 * el JWT debe incluir cada `recurso:acción` en `user.permissions`.
 */
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { JwtUserPayload } from '../../modules/auth/types/jwt-user.payload';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const required = this.reflector.getAllAndOverride<string[] | undefined>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const req = context.switchToHttp().getRequest<Request & { user?: JwtUserPayload }>();
    const user = req.user;
    if (!user) {
      throw new ForbiddenException('Usuario no autenticado');
    }

    // Sin `@RequirePermissions`, solo basta con estar autenticado (otros guards deciden).
    if (!required || required.length === 0) {
      return true;
    }

    const granted = new Set(user.permissions);
    const missing = required.filter((code) => !granted.has(code));
    if (missing.length > 0) {
      throw new ForbiddenException({
        message: 'Permisos insuficientes',
        missing,
      });
    }
    return true;
  }
}
