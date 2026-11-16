import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

export class CurrentUserPayload {
  id: string;
  email: string;
  username: string;
  jti?: string;
  exp?: number;
  token?: string;
}

export type AuthenticatedRequest = Request & {
  user?: CurrentUserPayload;
};

export const CurrentUser = createParamDecorator(
  (data: keyof CurrentUserPayload | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    if (!user) {
      return null;
    }

    return data ? user[data] : user;
  },
);
