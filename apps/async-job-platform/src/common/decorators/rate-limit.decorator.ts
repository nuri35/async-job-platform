import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_KEY = 'rate_limit';

export interface RateLimitOptions {
  max: number;
  timeWindow: string;
}

/**
 * Custom decorator to set rate limit options for specific endpoints
 * @param options - Rate limit configuration
 * @example @RateLimit({ max: 10, timeWindow: '1 minute' })
 */
export const RateLimit = (options: RateLimitOptions) =>
  SetMetadata(RATE_LIMIT_KEY, options);
