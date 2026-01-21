import { Injectable } from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';

export enum AttemptStatus {
  SUCCESS = 'success',
  FAILED = 'failed',
}

export interface LoginAttemptData {
  ip: string;
  email: string;
  fingerprint: string;
  status: AttemptStatus;
  userId?: string | null;
}

@Injectable()
export class RiskTrackingService {
  // Redis Keys
  private readonly ATTEMPTS_KEY = 'risk:attempts';
  private readonly ACTIVE_KEY = 'risk:active';
  private readonly LEVELS_KEY = 'risk:levels';
  private readonly IP_TARGETS_PREFIX = 'risk:ip:';

  // TTLs
  private readonly ATTEMPTS_TTL = 60 * 60; // 1 saat
  private readonly TARGETS_TTL = 60 * 60; // 1 saat

  constructor(
    @InjectRedis()
    private readonly redis: Redis,
  ) {}

  /**
   * Login attempt'i kaydet
   */
  async recordAttempt(data: LoginAttemptData): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    const member = `${data.ip}:${data.email}:${data.fingerprint}:${data.status}`;

    const pipeline = this.redis.pipeline();

    // 1. SORTED SET'e attempt ekle (sliding window için)
    pipeline.zadd(this.ATTEMPTS_KEY, now, `${now}:${member}`);
    pipeline.expire(this.ATTEMPTS_KEY, this.ATTEMPTS_TTL);

    // 2. Aktif IP listesine ekle (CronJob tarayacak)
    pipeline.sadd(this.ACTIVE_KEY, data.ip); // maybe for not realistic ip

    // 3. Bu IP'nin hedef aldığı email'leri kaydet (sadece failed için)
    if (data.status === AttemptStatus.FAILED) {
      const targetsKey = `${this.IP_TARGETS_PREFIX}${data.ip}:targets`;
      pipeline.sadd(targetsKey, data.email);
      pipeline.expire(targetsKey, this.TARGETS_TTL);
    }

    await pipeline.exec(); // for performance
  }

  /**
   * Son X dakikadaki attempt'leri getir
   */
  async getRecentAttempts(minutes: number): Promise<string[]> {
    const now = Math.floor(Date.now() / 1000);
    const since = now - minutes * 60;

    return this.redis.zrangebyscore(this.ATTEMPTS_KEY, since, now);
  }

  /**
   * Belirli IP için son X dakikadaki failed sayısı
   */
  async getFailedCountByIp(ip: string, minutes: number): Promise<number> {
    const attempts = await this.getRecentAttempts(minutes);

    return attempts.filter((attempt) => {
      const parts = attempt.split(':');
      // Format: "timestamp:ip:email:fingerprint:status"
      const attemptIp = parts[1];
      const status = parts[4] as AttemptStatus;
      return attemptIp === ip && status === AttemptStatus.FAILED;
    }).length;
  }

  /**
   * IP'nin hedef aldığı email sayısı
   */
  async getTargetCountByIp(ip: string): Promise<number> {
    const targetsKey = `${this.IP_TARGETS_PREFIX}${ip}:targets`;
    return this.redis.scard(targetsKey);
  }

  /**
   * IP'nin hedef aldığı email listesi
   */
  async getTargetsByIp(ip: string): Promise<string[]> {
    const targetsKey = `${this.IP_TARGETS_PREFIX}${ip}:targets`;
    return this.redis.smembers(targetsKey);
  }

  /**
   * Aktif IP listesi (CronJob için)
   */
  async getActiveIps(): Promise<string[]> {
    return this.redis.smembers(this.ACTIVE_KEY);
  }

  /**
   * IP'nin mevcut risk level'ı
   */
  async getRiskLevel(ip: string): Promise<string | null> {
    return this.redis.hget(this.LEVELS_KEY, ip);
  }

  /**
   * IP'nin risk level'ını güncelle
   */
  async setRiskLevel(ip: string, level: string): Promise<void> {
    await this.redis.hset(this.LEVELS_KEY, ip, level);
  }

  /**
   * IP'yi aktif listeden çıkar (aktivite bitince)
   */
  async removeFromActive(ip: string): Promise<void> {
    await this.redis.srem(this.ACTIVE_KEY, ip);
    await this.redis.hdel(this.LEVELS_KEY, ip);
    await this.redis.del(`${this.IP_TARGETS_PREFIX}${ip}:targets`);
  }

  /**
   * Eski kayıtları temizle (1 saatten eski)
   */
  async cleanupOldAttempts(): Promise<number> {
    const cutoff = Math.floor(Date.now() / 1000) - this.ATTEMPTS_TTL;
    return this.redis.zremrangebyscore(this.ATTEMPTS_KEY, 0, cutoff);
  }
}
