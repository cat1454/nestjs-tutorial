import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export class CurrentUserPayload {
  id: string;
  email: string;
  username: string;
  token?: string;
}

export const CurrentUser = createParamDecorator(
  (data: keyof CurrentUserPayload | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      return null;
    }

    return data ? user[data] : user;
  },
);
