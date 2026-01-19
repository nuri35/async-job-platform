import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FastifyRequest } from 'fastify';
import { RATE_LIMIT_KEY, RateLimitOptions } from '../decorators';

interface RateLimitStore {
  count: number;
  resetTime: number;
}

/**
 * RateLimitGuard - Enforces per-endpoint rate limiting
 *
 * WARNING: This implementation uses in-memory storage for rate limit tracking.
 * For production multi-instance deployments, consider using Redis or another
 * distributed cache to ensure consistent rate limiting across instances.
 *
 * The in-memory store is cleaned up periodically to prevent memory leaks.
 */
@Injectable()
export class RateLimitGuard
  implements CanActivate, OnModuleInit, OnModuleDestroy
{
  private store = new Map<string, RateLimitStore>();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(private reflector: Reflector) {}

  onModuleInit() {
    // Clean up expired entries every 5 minutes to prevent memory leaks
    this.cleanupInterval = setInterval(
      () => {
        this.cleanupExpiredEntries();
      },
      5 * 60 * 1000,
    );
  }

  onModuleDestroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }

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

  private cleanupExpiredEntries(): void {
    const now = Date.now();
    let removedCount = 0;

    for (const [key, record] of this.store.entries()) {
      if (now > record.resetTime) {
        this.store.delete(key);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      console.log(
        `[RateLimitGuard] Cleaned up ${removedCount} expired entries`,
      );
    }
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
