import { Injectable } from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';

interface SessionData {
  deviceFingerprint: string;
  deviceName: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  lastActivity: string;
}

@Injectable()
export class SessionService {
  private readonly SESSION_PREFIX = 'session:';
  private readonly BLACKLIST_PREFIX = 'blacklist:jwt:';
  private readonly RATE_LIMIT_PREFIX = 'ratelimit:';
  private readonly DEVICE_ATTEMPT_PREFIX = 'login:device:';
  private readonly DEVICE_BLOCK_PREFIX = 'login:block:';
  private readonly SESSION_TTL = 7 * 24 * 60 * 60; // 7 days in seconds
  private readonly ACCESS_TOKEN_TTL = 15 * 60; // 15 minutes in seconds
  private readonly DEVICE_ATTEMPT_TTL = 60 * 60; // 1 hour in seconds
  private readonly DEVICE_BLOCK_TTL = 7 * 24 * 60 * 60; // 7 days in seconds
  private readonly MAX_DEVICE_ATTEMPTS = 5;
  private readonly MAX_BLOCKS_BEFORE_DEACTIVATION = 3;

  constructor(
    @InjectRedis()
    private readonly redis: Redis,
  ) {}

  // Session Management
  async createSession(
    userId: string,
    jti: string,
    data: Omit<SessionData, 'createdAt' | 'lastActivity'>,
  ): Promise<void> {
    const sessionData: SessionData = {
      ...data,
      createdAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
    };

    await this.redis.set(
      `${this.SESSION_PREFIX}${userId}:${jti}`,
      JSON.stringify(sessionData),
      'EX',
      this.SESSION_TTL,
    );
  }

  async getSession(userId: string, jti: string): Promise<SessionData | null> {
    const data = await this.redis.get(`${this.SESSION_PREFIX}${userId}:${jti}`);
    return data ? (JSON.parse(data) as SessionData) : null;
  }

  async getAllSessions(
    userId: string,
  ): Promise<Array<{ jti: string; data: SessionData }>> {
    const pattern = `${this.SESSION_PREFIX}${userId}:*`;
    const keys = await this.redis.keys(pattern);
    const sessions: Array<{ jti: string; data: SessionData }> = [];

    for (const key of keys) {
      const jti = key.replace(`${this.SESSION_PREFIX}${userId}:`, '');
      const data = await this.redis.get(key);
      if (data) {
        sessions.push({ jti, data: JSON.parse(data) as SessionData });
      }
    }

    return sessions;
  }

  async countSessions(userId: string): Promise<number> {
    const pattern = `${this.SESSION_PREFIX}${userId}:*`;
    const keys = await this.redis.keys(pattern);
    return keys.length;
  }

  async deleteSession(userId: string, jti: string): Promise<void> {
    await this.redis.del(`${this.SESSION_PREFIX}${userId}:${jti}`);
  }

  async deleteAllSessions(userId: string): Promise<string[]> {
    const pattern = `${this.SESSION_PREFIX}${userId}:*`;
    const keys = await this.redis.keys(pattern);
    const jtis: string[] = [];

    for (const key of keys) {
      const jti = key.replace(`${this.SESSION_PREFIX}${userId}:`, '');
      jtis.push(jti);
      await this.redis.del(key);
    }

    return jtis;
  }

  async updateLastActivity(userId: string, jti: string): Promise<void> {
    const session = await this.getSession(userId, jti);
    if (session) {
      session.lastActivity = new Date().toISOString();
      await this.redis.set(
        `${this.SESSION_PREFIX}${userId}:${jti}`,
        JSON.stringify(session),
        'EX',
        this.SESSION_TTL,
      );
    }
  }

  // JWT Blacklist
  async blacklistToken(jti: string, expiresInSeconds?: number): Promise<void> {
    const ttl = expiresInSeconds || this.ACCESS_TOKEN_TTL;
    await this.redis.set(`${this.BLACKLIST_PREFIX}${jti}`, '1', 'EX', ttl);
  }

  async isTokenBlacklisted(jti: string): Promise<boolean> {
    const result = await this.redis.get(`${this.BLACKLIST_PREFIX}${jti}`);
    return result !== null;
  }

  async blacklistMultipleTokens(jtis: string[]): Promise<void> {
    const pipeline = this.redis.pipeline();
    for (const jti of jtis) {
      pipeline.set(
        `${this.BLACKLIST_PREFIX}${jti}`,
        '1',
        'EX',
        this.ACCESS_TOKEN_TTL,
      );
    }
    await pipeline.exec();
  }

  // Rate Limiting
  async incrementRateLimit(
    key: string,
    windowSeconds: number,
  ): Promise<number> {
    const redisKey = `${this.RATE_LIMIT_PREFIX}${key}`;
    const count = await this.redis.incr(redisKey);
    if (count === 1) {
      await this.redis.expire(redisKey, windowSeconds);
    }
    return count;
  }

  async getRateLimitCount(key: string): Promise<number> {
    const count = await this.redis.get(`${this.RATE_LIMIT_PREFIX}${key}`);
    return count ? parseInt(count, 10) : 0;
  }

  async resetRateLimit(key: string): Promise<void> {
    await this.redis.del(`${this.RATE_LIMIT_PREFIX}${key}`);
  }

  // Device-based Login Rate Limiting
  private getDeviceAttemptKey(email: string, fingerprint: string): string {
    return `${this.DEVICE_ATTEMPT_PREFIX}${email}:${fingerprint}`;
  }

  private getDeviceBlockKey(email: string, fingerprint: string): string {
    return `${this.DEVICE_BLOCK_PREFIX}${email}:${fingerprint}`;
  }

  async getDeviceLoginAttempts(
    email: string,
    fingerprint: string,
  ): Promise<number> {
    const key = this.getDeviceAttemptKey(email, fingerprint);
    const count = await this.redis.get(key);
    return count ? parseInt(count, 10) : 0;
  }

  async incrementDeviceLoginAttempts(
    email: string,
    fingerprint: string,
  ): Promise<number> {
    const key = this.getDeviceAttemptKey(email, fingerprint);
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, this.DEVICE_ATTEMPT_TTL);
    }
    return count;
  }

  async resetDeviceLoginAttempts(
    email: string,
    fingerprint: string,
  ): Promise<void> {
    const key = this.getDeviceAttemptKey(email, fingerprint);
    await this.redis.del(key);
  }

  async getDeviceBlockCount(
    email: string,
    fingerprint: string,
  ): Promise<number> {
    const key = this.getDeviceBlockKey(email, fingerprint);
    const count = await this.redis.get(key);
    return count ? parseInt(count, 10) : 0;
  }

  async incrementDeviceBlockCount(
    email: string,
    fingerprint: string,
  ): Promise<number> {
    const key = this.getDeviceBlockKey(email, fingerprint);
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, this.DEVICE_BLOCK_TTL);
    }
    return count;
  }

  async resetDeviceBlockCount(
    email: string,
    fingerprint: string,
  ): Promise<void> {
    const key = this.getDeviceBlockKey(email, fingerprint);
    await this.redis.del(key);
  }

  async isDeviceBlocked(email: string, fingerprint: string): Promise<boolean> {
    const attempts = await this.getDeviceLoginAttempts(email, fingerprint);
    return attempts >= this.MAX_DEVICE_ATTEMPTS;
  }

  async shouldDeactivateAccount(
    email: string,
    fingerprint: string,
  ): Promise<boolean> {
    const blockCount = await this.getDeviceBlockCount(email, fingerprint);
    return blockCount >= this.MAX_BLOCKS_BEFORE_DEACTIVATION;
  }

  // Check if fingerprint already has active session for user
  async findSessionByFingerprint(
    userId: string,
    fingerprint: string,
  ): Promise<{ jti: string; data: SessionData } | null> {
    const sessions = await this.getAllSessions(userId);
    return (
      sessions.find((s) => s.data.deviceFingerprint === fingerprint) || null
    );
  }
}
