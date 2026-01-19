import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FastifyRequest } from 'fastify';
import { RATE_LIMIT_KEY, RateLimitOptions } from '../decorators';

interface RateLimitStore {
  count: number;
  resetTime: number;
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  private store = new Map<string, RateLimitStore>();

  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const rateLimitOptions = this.reflector.get<RateLimitOptions>(
      RATE_LIMIT_KEY,
      context.getHandler(),
    );

    if (!rateLimitOptions) {
      // No custom rate limit, allow the request
      return true;
    }

    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const key = this.generateKey(request);
    const now = Date.now();

    const windowMs = this.parseTimeWindow(rateLimitOptions.timeWindow);

    let record = this.store.get(key);

    if (!record || now > record.resetTime) {
      // Create new record
      record = {
        count: 1,
        resetTime: now + windowMs,
      };
      this.store.set(key, record);
      return true;
    }

    if (record.count >= rateLimitOptions.max) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: 'Too Many Requests',
          message: `Rate limit exceeded for this endpoint. Max ${rateLimitOptions.max} requests per ${rateLimitOptions.timeWindow}`,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    record.count++;
    return true;
  }

  private generateKey(request: FastifyRequest): string {
    const ip =
      request.headers['x-forwarded-for']?.toString() || request.ip || 'unknown';
    const url = request.url || '';
    return `${ip}:${url}`;
  }

  private parseTimeWindow(timeWindow: string): number {
    const match = timeWindow.match(/^(\d+)\s*(second|minute|hour|day)s?$/i);
    if (!match) {
      return 60000; // Default to 1 minute
    }

    const value = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();

    const multipliers: Record<string, number> = {
      second: 1000,
      minute: 60000,
      hour: 3600000,
      day: 86400000,
    };

    return value * (multipliers[unit] || 60000);
  }
}
