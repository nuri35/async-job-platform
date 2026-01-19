import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JwtPayload } from '@app/common';

interface RequestWithUser {
  user: JwtPayload;
}

export const CurrentUser = createParamDecorator(
  (
    data: keyof JwtPayload | undefined,
    ctx: ExecutionContext,
  ): JwtPayload | string => {
    const request = ctx.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;

    if (data) {
      return user[data] as string;
    }

    return user;
  },
);
