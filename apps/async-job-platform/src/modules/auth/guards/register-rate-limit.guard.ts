import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';

@Injectable()
export class RegisterRateLimitGuard implements CanActivate {
  private readonly MAX_REGISTRATIONS = 20;
  private readonly WINDOW_SECONDS = 3600; // 1 saat

  constructor(
    @InjectRedis()
    private readonly redis: Redis,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const ip =
      request.ip || request.headers['x-forwarded-for']?.toString() || 'unknown';
    const key = `register:ratelimit:${ip}`;

    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, this.WINDOW_SECONDS);
    }

    if (count > this.MAX_REGISTRATIONS) {
      throw new HttpException(
        'Too many registration attempts. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
