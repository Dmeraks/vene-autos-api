import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { JwtUserPayload } from '../../modules/auth/types/jwt-user.payload';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtUserPayload | undefined => {
    const req = ctx.switchToHttp().getRequest<Request & { user?: JwtUserPayload }>();
    return req.user;
  },
);
