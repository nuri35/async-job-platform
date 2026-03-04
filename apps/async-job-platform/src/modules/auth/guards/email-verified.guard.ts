import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { IUserRepository } from '../repositories';

@Injectable()
export class EmailVerifiedGuard implements CanActivate {
  constructor(private readonly userRepository: IUserRepository) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId = request.user?.sub;

    if (!userId) {
      throw new ForbiddenException('Authentication required');
    }

    const user = await this.userRepository.findById(userId);
    if (!user || !user.isEmailVerified) {
      throw new ForbiddenException(
        'Email verification required to submit jobs',
      );
    }

    return true;
  }
}
