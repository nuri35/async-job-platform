# Rate Limiting Implementation

This document describes the rate limiting implementation in the Async Job Platform.

## Overview

The application implements a two-tier rate limiting strategy:
1. **Global Rate Limiting**: Applied to all endpoints
2. **Per-Endpoint Rate Limiting**: Applied to specific sensitive endpoints

## Configuration

Rate limiting is configured via environment variables:

```env
RATE_LIMIT_MAX=100          # Maximum requests per time window (global)
RATE_LIMIT_WINDOW=15 minutes # Time window for rate limiting (global)
```

## Global Rate Limiting

All API endpoints are subject to a global rate limit:
- **Default**: 100 requests per 15 minutes
- **Per**: IP address (uses `x-forwarded-for` header if available)

## Per-Endpoint Rate Limiting

Specific endpoints have stricter rate limits:

### POST /api/v1/jobs
- **Limit**: 10 requests per minute
- **Reason**: Prevents abuse of job creation

### POST /api/v1/jobs/:id/retry
- **Limit**: 5 requests per minute
- **Reason**: Prevents retry flooding

## Implementation Details

### Global Rate Limit
Implemented using `@fastify/rate-limit` plugin at the application level (main.ts).

### Per-Endpoint Rate Limit
Implemented using:
- **Decorator**: `@RateLimit({ max: number, timeWindow: string })`
- **Guard**: `RateLimitGuard` - Enforces the rate limit based on decorator metadata

**⚠️ Production Considerations:**
- The current implementation uses in-memory storage for per-endpoint rate limits
- For multi-instance deployments, consider migrating to Redis or another distributed cache
- The in-memory store is cleaned up every 5 minutes to prevent memory leaks
- Global rate limiting via `@fastify/rate-limit` works correctly in multi-instance setups when using Redis

## Usage

To add rate limiting to a new endpoint:

```typescript
import { RateLimit } from '../../common/decorators';
import { RateLimitGuard } from '../../common/guards';

@Controller('example')
@UseGuards(RateLimitGuard)
export class ExampleController {
  
  @Post()
  @RateLimit({ max: 20, timeWindow: '1 minute' })
  async create() {
    // Your implementation
  }
}
```

## Response

When rate limit is exceeded, the API returns:

```json
{
  "statusCode": 429,
  "error": "Too Many Requests",
  "message": "Rate limit exceeded. Please try again later."
}
```

For per-endpoint limits:
```json
{
  "statusCode": 429,
  "error": "Too Many Requests",
  "message": "Rate limit exceeded for this endpoint. Max X requests per Y"
}
```

## Logging

Rate limiting events are logged:
- Warning when approaching limit
- Warning when limit exceeded
- Logs include IP address for troubleshooting
- Cleanup logs show number of expired entries removed

## Testing

To test rate limiting:
1. Make multiple rapid requests to an endpoint
2. Verify 429 status code is returned after exceeding limit
3. Wait for the time window to expire
4. Verify requests are accepted again

## Future Improvements

For production deployments with multiple instances:
1. Migrate per-endpoint rate limiting to use Redis
2. Consider using a library like `@nestjs/throttler` with Redis support
3. Add monitoring and alerting for rate limit violations
4. Implement different rate limits based on user authentication/authorization levels
