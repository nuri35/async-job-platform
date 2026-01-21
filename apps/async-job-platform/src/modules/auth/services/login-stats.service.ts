import { Injectable } from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import { LoginStatus } from '@app/common';

export interface LoginStatsSnapshot {
  total: number;
  success: number;
  failed: number;
  successRate: number;
}

export interface DetailedLoginStats {
  last5Minutes: LoginStatsSnapshot;
  lastHour: LoginStatsSnapshot;
  today: LoginStatsSnapshot;
  uniqueUsersToday: number;
}

@Injectable()
export class LoginStatsService {
  // Redis key prefixes
  private readonly REALTIME_PREFIX = 'login:realtime:';
  private readonly DAILY_COUNT_PREFIX = 'login:count:daily:';
  private readonly HOURLY_COUNT_PREFIX = 'login:count:hourly:';
  private readonly UNIQUE_USERS_PREFIX = 'login:unique:daily:';

  // TTLs
  private readonly REALTIME_TTL = 60 * 60; // 1 hour - keep realtime data for 1 hour
  private readonly DAILY_TTL = 7 * 24 * 60 * 60; // 7 days
  private readonly HOURLY_TTL = 24 * 60 * 60; // 24 hours

  constructor(
    @InjectRedis()
    private readonly redis: Redis,
  ) {}

  /**
   * Record a login attempt for real-time stats
   */
  async recordLogin(
    status: LoginStatus,
    userId: string | null,
    metadata?: { email?: string; ipAddress?: string },
  ): Promise<void> {
    const now = Date.now();
    const timestamp = Math.floor(now / 1000);
    const uniqueId = `${now}:${userId || metadata?.email || metadata?.ipAddress || 'unknown'}`;

    const dateKey = this.getDateKey(new Date());
    const hourKey = this.getHourKey(new Date());

    const pipeline = this.redis.pipeline();

    // 1. Real-time sorted set (score = timestamp, member = unique identifier)
    const realtimeKey = `${this.REALTIME_PREFIX}${status}`;
    pipeline.zadd(realtimeKey, timestamp, uniqueId);
    // Remove entries older than 1 hour
    pipeline.zremrangebyscore(realtimeKey, 0, timestamp - this.REALTIME_TTL);
    pipeline.expire(realtimeKey, this.REALTIME_TTL);

    // 2. Daily counter
    const dailyKey = `${this.DAILY_COUNT_PREFIX}${dateKey}:${status}`;
    pipeline.incr(dailyKey);
    pipeline.expire(dailyKey, this.DAILY_TTL);

    // 3. Hourly counter
    const hourlyKey = `${this.HOURLY_COUNT_PREFIX}${hourKey}:${status}`;
    pipeline.incr(hourlyKey);
    pipeline.expire(hourlyKey, this.HOURLY_TTL);

    // 4. Unique users (HyperLogLog) - only for successful logins with userId
    if (status === LoginStatus.SUCCESS && userId) {
      const uniqueKey = `${this.UNIQUE_USERS_PREFIX}${dateKey}`;
      pipeline.pfadd(uniqueKey, userId);
      pipeline.expire(uniqueKey, this.DAILY_TTL);
    }

    await pipeline.exec();
  }

  /**
   * Get login count for last N minutes from real-time sorted set
   */
  async getRealtimeCount(
    status: LoginStatus,
    minutes: number,
  ): Promise<number> {
    const now = Math.floor(Date.now() / 1000);
    const since = now - minutes * 60;
    const key = `${this.REALTIME_PREFIX}${status}`;
    return this.redis.zcount(key, since, now);
  }

  /**
   * Get stats for last N minutes
   */
  async getStatsForLastMinutes(minutes: number): Promise<LoginStatsSnapshot> {
    const [success, failed] = await Promise.all([
      this.getRealtimeCount(LoginStatus.SUCCESS, minutes),
      this.getRealtimeCount(LoginStatus.FAILED, minutes),
    ]);

    const total = success + failed;
    const successRate = total > 0 ? (success / total) * 100 : 0;

    return {
      total,
      success,
      failed,
      successRate: Math.round(successRate * 100) / 100,
    };
  }

  /**
   * Get today's login counts
   */
  async getTodayStats(): Promise<LoginStatsSnapshot> {
    const dateKey = this.getDateKey(new Date());

    const [successStr, failedStr] = await Promise.all([
      this.redis.get(
        `${this.DAILY_COUNT_PREFIX}${dateKey}:${LoginStatus.SUCCESS}`,
      ),
      this.redis.get(
        `${this.DAILY_COUNT_PREFIX}${dateKey}:${LoginStatus.FAILED}`,
      ),
    ]);

    const success = parseInt(successStr || '0', 10);
    const failed = parseInt(failedStr || '0', 10);
    const total = success + failed;
    const successRate = total > 0 ? (success / total) * 100 : 0;

    return {
      total,
      success,
      failed,
      successRate: Math.round(successRate * 100) / 100,
    };
  }

  /**
   * Get unique user count for today
   */
  async getTodayUniqueUsers(): Promise<number> {
    const dateKey = this.getDateKey(new Date());
    const key = `${this.UNIQUE_USERS_PREFIX}${dateKey}`;
    return this.redis.pfcount(key);
  }

  /**
   * Get hourly stats for a specific hour
   */
  async getHourlyStats(date: Date): Promise<LoginStatsSnapshot> {
    const hourKey = this.getHourKey(date);

    const [successStr, failedStr] = await Promise.all([
      this.redis.get(
        `${this.HOURLY_COUNT_PREFIX}${hourKey}:${LoginStatus.SUCCESS}`,
      ),
      this.redis.get(
        `${this.HOURLY_COUNT_PREFIX}${hourKey}:${LoginStatus.FAILED}`,
      ),
    ]);

    const success = parseInt(successStr || '0', 10);
    const failed = parseInt(failedStr || '0', 10);
    const total = success + failed;
    const successRate = total > 0 ? (success / total) * 100 : 0;

    return {
      total,
      success,
      failed,
      successRate: Math.round(successRate * 100) / 100,
    };
  }

  /**
   * Get daily stats for a specific date
   */
  async getDailyStats(date: Date): Promise<LoginStatsSnapshot> {
    const dateKey = this.getDateKey(date);

    const [successStr, failedStr] = await Promise.all([
      this.redis.get(
        `${this.DAILY_COUNT_PREFIX}${dateKey}:${LoginStatus.SUCCESS}`,
      ),
      this.redis.get(
        `${this.DAILY_COUNT_PREFIX}${dateKey}:${LoginStatus.FAILED}`,
      ),
    ]);

    const success = parseInt(successStr || '0', 10);
    const failed = parseInt(failedStr || '0', 10);
    const total = success + failed;
    const successRate = total > 0 ? (success / total) * 100 : 0;

    return {
      total,
      success,
      failed,
      successRate: Math.round(successRate * 100) / 100,
    };
  }

  /**
   * Get comprehensive stats snapshot
   */
  async getDetailedStats(): Promise<DetailedLoginStats> {
    const [last5Minutes, lastHour, today, uniqueUsersToday] = await Promise.all(
      [
        this.getStatsForLastMinutes(5),
        this.getStatsForLastMinutes(60),
        this.getTodayStats(),
        this.getTodayUniqueUsers(),
      ],
    );

    return {
      last5Minutes,
      lastHour,
      today,
      uniqueUsersToday,
    };
  }

  /**
   * Get stats for last N days
   */
  async getStatsForLastDays(days: number): Promise<LoginStatsSnapshot[]> {
    const stats: LoginStatsSnapshot[] = [];
    const now = new Date();

    for (let i = 0; i < days; i++) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dailyStats = await this.getDailyStats(date);
      stats.push(dailyStats);
    }

    return stats;
  }

  /**
   * Get stats for last N hours
   */
  async getStatsForLastHours(hours: number): Promise<LoginStatsSnapshot[]> {
    const stats: LoginStatsSnapshot[] = [];
    const now = new Date();

    for (let i = 0; i < hours; i++) {
      const date = new Date(now.getTime() - i * 60 * 60 * 1000);
      const hourlyStats = await this.getHourlyStats(date);
      stats.push(hourlyStats);
    }

    return stats;
  }

  // Helper methods
  private getDateKey(date: Date): string {
    return date.toISOString().split('T')[0]; // YYYY-MM-DD
  }

  private getHourKey(date: Date): string {
    const dateStr = date.toISOString().split('T')[0];
    const hour = date.getUTCHours().toString().padStart(2, '0');
    return `${dateStr}:${hour}`; // YYYY-MM-DD:HH
  }
}
