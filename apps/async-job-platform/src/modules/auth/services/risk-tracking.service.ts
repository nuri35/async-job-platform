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
  // ============ Redis Keys ============

  // IP Bazlı (Mevcut)
  private readonly ATTEMPTS_KEY = 'risk:attempts';
  private readonly ACTIVE_KEY = 'risk:active';
  private readonly LEVELS_KEY = 'risk:levels';
  private readonly IP_TARGETS_PREFIX = 'risk:ip:';

  // Fingerprint Bazlı (Yeni)
  private readonly FP_ACTIVE_KEY = 'risk:fp:active';
  private readonly FP_LEVELS_KEY = 'risk:fp:levels';
  private readonly FP_PREFIX = 'risk:fp:';

  // Email Bazlı (Yeni)
  private readonly EMAIL_ACTIVE_KEY = 'risk:email:active';
  private readonly EMAIL_LEVELS_KEY = 'risk:email:levels';
  private readonly EMAIL_PREFIX = 'risk:email:';

  // ============ TTLs ============
  private readonly ATTEMPTS_TTL = 60 * 60; // 1 saat
  private readonly TARGETS_TTL = 60 * 60; // 1 saat

  constructor(
    @InjectRedis()
    private readonly redis: Redis,
  ) {}

  /**
   * Login attempt'i kaydet
   * 3 boyutlu tracking: IP + Fingerprint + Email
   */
  async recordAttempt(data: LoginAttemptData): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    const member = `${data.ip}:${data.email}:${data.fingerprint}:${data.status}`;

    const pipeline = this.redis.pipeline();

    // ============ IP BAZLI (Mevcut) ============

    // 1. SORTED SET'e attempt ekle (sliding window için)
    pipeline.zadd(this.ATTEMPTS_KEY, now, `${now}:${member}`);
    pipeline.expire(this.ATTEMPTS_KEY, this.ATTEMPTS_TTL);

    // 2. Aktif IP listesine ekle (CronJob tarayacak)
    pipeline.sadd(this.ACTIVE_KEY, data.ip);

    // 3. Bu IP'nin hedef aldığı email'leri kaydet (sadece failed için)
    if (data.status === AttemptStatus.FAILED) {
      const ipTargetsKey = `${this.IP_TARGETS_PREFIX}${data.ip}:targets`;
      pipeline.sadd(ipTargetsKey, data.email);
      pipeline.expire(ipTargetsKey, this.TARGETS_TTL);

      // ============ FINGERPRINT BAZLI (Yeni) ============
      // VPN/Proxy rotation tespiti için

      // 4. Aktif fingerprint listesine ekle
      pipeline.sadd(this.FP_ACTIVE_KEY, data.fingerprint);

      // 5. Bu fingerprint'in kullandığı IP'leri kaydet
      const fpIpsKey = `${this.FP_PREFIX}${data.fingerprint}:ips`;
      pipeline.sadd(fpIpsKey, data.ip);
      pipeline.expire(fpIpsKey, this.TARGETS_TTL);

      // 6. Bu fingerprint'in hedef aldığı email'leri kaydet
      const fpTargetsKey = `${this.FP_PREFIX}${data.fingerprint}:targets`;
      pipeline.sadd(fpTargetsKey, data.email);
      pipeline.expire(fpTargetsKey, this.TARGETS_TTL);

      // ============ EMAIL BAZLI (Yeni) ============
      // Distributed/Botnet saldırı tespiti için

      // 7. Aktif (saldırı altındaki) email listesine ekle
      pipeline.sadd(this.EMAIL_ACTIVE_KEY, data.email);

      // 8. Bu email'e saldıran IP'leri kaydet
      const emailIpsKey = `${this.EMAIL_PREFIX}${data.email}:ips`;
      pipeline.sadd(emailIpsKey, data.ip);
      pipeline.expire(emailIpsKey, this.TARGETS_TTL);

      // 9. Bu email'e saldıran fingerprint'leri kaydet
      const emailFpsKey = `${this.EMAIL_PREFIX}${data.email}:fingerprints`;
      pipeline.sadd(emailFpsKey, data.fingerprint);
      pipeline.expire(emailFpsKey, this.TARGETS_TTL);
    }

    await pipeline.exec();
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

  // ============ FINGERPRINT METHODS (Yeni) ============

  /**
   * Aktif fingerprint listesi (CronJob için)
   */
  async getActiveFingerprints(): Promise<string[]> {
    return this.redis.smembers(this.FP_ACTIVE_KEY);
  }

  /**
   * Fingerprint'in kullandığı IP sayısı (VPN rotation tespiti)
   */
  async getIpCountByFingerprint(fingerprint: string): Promise<number> {
    const key = `${this.FP_PREFIX}${fingerprint}:ips`;
    return this.redis.scard(key);
  }

  /**
   * Fingerprint'in kullandığı IP listesi
   */
  async getIpsByFingerprint(fingerprint: string): Promise<string[]> {
    const key = `${this.FP_PREFIX}${fingerprint}:ips`;
    return this.redis.smembers(key);
  }

  /**
   * Fingerprint'in hedef aldığı email sayısı
   */
  async getTargetCountByFingerprint(fingerprint: string): Promise<number> {
    const key = `${this.FP_PREFIX}${fingerprint}:targets`;
    return this.redis.scard(key);
  }

  /**
   * Fingerprint'in hedef aldığı email listesi
   */
  async getTargetsByFingerprint(fingerprint: string): Promise<string[]> {
    const key = `${this.FP_PREFIX}${fingerprint}:targets`;
    return this.redis.smembers(key);
  }

  /**
   * Fingerprint için son X dakikadaki failed sayısı
   */
  async getFailedCountByFingerprint(
    fingerprint: string,
    minutes: number,
  ): Promise<number> {
    const attempts = await this.getRecentAttempts(minutes);

    return attempts.filter((attempt) => {
      const parts = attempt.split(':');
      // Format: "timestamp:ip:email:fingerprint:status"
      const attemptFp = parts[3];
      const status = parts[4] as AttemptStatus;
      return attemptFp === fingerprint && status === AttemptStatus.FAILED;
    }).length;
  }

  /**
   * Fingerprint'in risk level'ı
   */
  async getFingerprintRiskLevel(fingerprint: string): Promise<string | null> {
    return this.redis.hget(this.FP_LEVELS_KEY, fingerprint);
  }

  /**
   * Fingerprint'in risk level'ını güncelle
   */
  async setFingerprintRiskLevel(
    fingerprint: string,
    level: string,
  ): Promise<void> {
    await this.redis.hset(this.FP_LEVELS_KEY, fingerprint, level);
  }

  /**
   * Fingerprint'i aktif listeden çıkar
   */
  async removeFromActiveFingerprint(fingerprint: string): Promise<void> {
    await this.redis.srem(this.FP_ACTIVE_KEY, fingerprint);
    await this.redis.hdel(this.FP_LEVELS_KEY, fingerprint);
    await this.redis.del(`${this.FP_PREFIX}${fingerprint}:ips`);
    await this.redis.del(`${this.FP_PREFIX}${fingerprint}:targets`);
  }

  // ============ EMAIL METHODS (Yeni) ============

  /**
   * Aktif (saldırı altındaki) email listesi (CronJob için)
   */
  async getActiveEmails(): Promise<string[]> {
    return this.redis.smembers(this.EMAIL_ACTIVE_KEY);
  }

  /**
   * Email'e saldıran IP sayısı (Distributed attack tespiti)
   */
  async getAttackerIpCountByEmail(email: string): Promise<number> {
    const key = `${this.EMAIL_PREFIX}${email}:ips`;
    return this.redis.scard(key);
  }

  /**
   * Email'e saldıran IP listesi
   */
  async getAttackerIpsByEmail(email: string): Promise<string[]> {
    const key = `${this.EMAIL_PREFIX}${email}:ips`;
    return this.redis.smembers(key);
  }

  /**
   * Email'e saldıran fingerprint sayısı (Botnet tespiti)
   */
  async getAttackerFpCountByEmail(email: string): Promise<number> {
    const key = `${this.EMAIL_PREFIX}${email}:fingerprints`;
    return this.redis.scard(key);
  }

  /**
   * Email'e saldıran fingerprint listesi
   */
  async getAttackerFpsByEmail(email: string): Promise<string[]> {
    const key = `${this.EMAIL_PREFIX}${email}:fingerprints`;
    return this.redis.smembers(key);
  }

  /**
   * Email için son X dakikadaki failed sayısı
   */
  async getFailedCountByEmail(email: string, minutes: number): Promise<number> {
    const attempts = await this.getRecentAttempts(minutes);

    return attempts.filter((attempt) => {
      const parts = attempt.split(':');
      // Format: "timestamp:ip:email:fingerprint:status"
      const attemptEmail = parts[2];
      const status = parts[4] as AttemptStatus;
      return attemptEmail === email && status === AttemptStatus.FAILED;
    }).length;
  }

  /**
   * Email'in risk level'ı
   */
  async getEmailRiskLevel(email: string): Promise<string | null> {
    return this.redis.hget(this.EMAIL_LEVELS_KEY, email);
  }

  /**
   * Email'in risk level'ını güncelle
   */
  async setEmailRiskLevel(email: string, level: string): Promise<void> {
    await this.redis.hset(this.EMAIL_LEVELS_KEY, email, level);
  }

  /**
   * Email'i aktif listeden çıkar
   */
  async removeFromActiveEmail(email: string): Promise<void> {
    await this.redis.srem(this.EMAIL_ACTIVE_KEY, email);
    await this.redis.hdel(this.EMAIL_LEVELS_KEY, email);
    await this.redis.del(`${this.EMAIL_PREFIX}${email}:ips`);
    await this.redis.del(`${this.EMAIL_PREFIX}${email}:fingerprints`);
  }

  // ============ CLEANUP METHODS ============

  /**
   * Eski kayıtları temizle (1 saatten eski)
   */
  async cleanupOldAttempts(): Promise<number> {
    const cutoff = Math.floor(Date.now() / 1000) - this.ATTEMPTS_TTL;
    return this.redis.zremrangebyscore(this.ATTEMPTS_KEY, 0, cutoff);
  }
}
