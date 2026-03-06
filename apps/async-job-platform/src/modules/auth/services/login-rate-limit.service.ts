import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';

interface RedisWithCustomCommands extends Redis {
  slidingWindowCheck(
    windowKey: string,
    lockKey: string,
    now: number,
    windowStart: number,
    uniqueId: string,
    windowSeconds: number,
    threshold: number,
    lockTtl: number,
  ): Promise<[number, number]>;
}

const EMAIL_FAIL_THRESHOLD = 5;
const IP_FAIL_THRESHOLD = 15;
const WINDOW_SECONDS = 900; // 15 dakika sliding window
const LOCK_TTL = 900; // 15 dakika lock süresi
const NOTIFY_COOLDOWN_TTL = 3600; // 1 saat email cooldown
const EMAIL_DELAY_START = 3; // 3. fail'den itibaren delay
const IP_DELAY_START = 11; // 11. fail'den itibaren delay

/**
 * Lua script: sliding window + threshold check + lock — tek atomic operasyon.
 *
 * KEYS[1] = sliding window sorted set key
 * KEYS[2] = lock/block key
 *
 * ARGV[1] = now (timestamp ms)
 * ARGV[2] = window_start (timestamp ms)
 * ARGV[3] = unique_id
 * ARGV[4] = window_ttl (seconds)
 * ARGV[5] = threshold
 * ARGV[6] = lock_ttl (seconds)
 *
 * Returns: {count, locked} (as array [count, locked])
 */
const SLIDING_WINDOW_CHECK_LUA = `
local window_key = KEYS[1]
local lock_key = KEYS[2]

local now = tonumber(ARGV[1])
local window_start = tonumber(ARGV[2])
local unique_id = ARGV[3]
local window_ttl = tonumber(ARGV[4])
local threshold = tonumber(ARGV[5])
local lock_ttl = tonumber(ARGV[6])

redis.call('ZREMRANGEBYSCORE', window_key, 0, window_start)
redis.call('ZADD', window_key, now, unique_id)
local count = redis.call('ZCARD', window_key)
redis.call('EXPIRE', window_key, window_ttl)

local locked = 0
if count >= threshold then
  redis.call('SET', lock_key, '1', 'EX', lock_ttl)
  locked = 1
end

return {count, locked}
`;

@Injectable()
export class LoginRateLimitService {
  private readonly logger = new Logger(LoginRateLimitService.name);

  constructor(
    @InjectRedis()
    private readonly redis: RedisWithCustomCommands,
  ) {
    this.redis.defineCommand('slidingWindowCheck', {
      numberOfKeys: 2,
      lua: SLIDING_WINDOW_CHECK_LUA,
    });
  }

  async checkIpBlocked(ip: string): Promise<void> {
    const blocked = await this.redis.get(`login:block:ip:${ip}`);
    if (blocked) {
      this.logger.debug(`Blocked IP attempted login: ${ip}`);
      throw new UnauthorizedException('Invalid credentials');
    }
  }

  async checkEmailLocked(email: string): Promise<void> {
    const locked = await this.redis.get(`login:lock:email:${email}`);
    if (locked) {
      this.logger.debug(`Locked email attempted login: ${email}`);
      throw new UnauthorizedException('Invalid credentials');
    }
  }

  async recordFailedAttempt(
    email: string,
    ip: string,
  ): Promise<{ delayMs: number; emailLocked: boolean }> {
    const emailResult = await this.addToSlidingWindowAtomic(
      `login:sw:email:${email}`,
      `login:lock:email:${email}`,
      WINDOW_SECONDS,
      EMAIL_FAIL_THRESHOLD,
    );

    const ipResult = await this.addToSlidingWindowAtomic(
      `login:sw:ip:${ip}`,
      `login:block:ip:${ip}`,
      WINDOW_SECONDS,
      IP_FAIL_THRESHOLD,
    );

    if (emailResult.locked) {
      this.logger.warn(
        `Email locked after ${emailResult.count} failed attempts: ${email}`,
      );
    }

    if (ipResult.locked) {
      this.logger.warn(
        `IP blocked after ${ipResult.count} failed attempts: ${ip}`,
      );
    }

    // Progressive delay — take the higher delay
    const emailDelay = this.calculateDelay(
      emailResult.count,
      EMAIL_DELAY_START,
    );
    const ipDelay = this.calculateDelay(ipResult.count, IP_DELAY_START);

    return {
      delayMs: Math.max(emailDelay, ipDelay),
      emailLocked: emailResult.locked,
    };
  }

  async clearEmailCounters(email: string): Promise<void> {
    await this.redis.del(`login:sw:email:${email}`);
  }

  async shouldNotifyLock(email: string): Promise<boolean> {
    const cooldownKey = `login:lock-notify:${email}`;
    const result = await this.redis.set(
      cooldownKey,
      '1',
      'EX',
      NOTIFY_COOLDOWN_TTL,
      'NX',
    );
    return result === 'OK';
  }

  private async addToSlidingWindowAtomic(
    windowKey: string,
    lockKey: string,
    windowSeconds: number,
    threshold: number,
  ): Promise<{ count: number; locked: boolean }> {
    const now = Date.now();
    const windowStart = now - windowSeconds * 1000;
    const uniqueId = `${now}:${Math.random().toString(36).slice(2, 8)}`;

    const result = await this.redis.slidingWindowCheck(
      windowKey,
      lockKey,
      now,
      windowStart,
      uniqueId,
      windowSeconds,
      threshold,
      LOCK_TTL,
    );

    return {
      count: result[0],
      locked: result[1] === 1,
    };
  }

  private calculateDelay(count: number, delayStart: number): number {
    if (count < delayStart) return 0;
    const delayIndex = count - delayStart;
    return Math.min(1000 * Math.pow(2, delayIndex), 8000); // max 8s
  }
}
