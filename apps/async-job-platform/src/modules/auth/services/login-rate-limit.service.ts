import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';

const EMAIL_FAIL_THRESHOLD = 5;
const IP_FAIL_THRESHOLD = 15;
const WINDOW_SECONDS = 900; // 15 dakika sliding window
const LOCK_TTL = 900; // 15 dakika lock süresi
const NOTIFY_COOLDOWN_TTL = 3600; // 1 saat email cooldown
const EMAIL_DELAY_START = 3; // 3. fail'den itibaren delay
const IP_DELAY_START = 11; // 11. fail'den itibaren delay

@Injectable()
export class LoginRateLimitService {
  private readonly logger = new Logger(LoginRateLimitService.name);

  constructor(
    @InjectRedis()
    private readonly redis: Redis,
  ) {}

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
    const emailCount = await this.addToSlidingWindow(
      `login:sw:email:${email}`,
      WINDOW_SECONDS,
    );
    const ipCount = await this.addToSlidingWindow(
      `login:sw:ip:${ip}`,
      WINDOW_SECONDS,
    );

    // Email threshold check
    let emailLocked = false;
    if (emailCount >= EMAIL_FAIL_THRESHOLD) {
      await this.lockEmail(email);
      emailLocked = true;
      this.logger.warn(
        `Email locked after ${emailCount} failed attempts: ${email}`,
      );
    }

    // IP threshold check
    if (ipCount >= IP_FAIL_THRESHOLD) {
      await this.blockIp(ip);
      this.logger.warn(`IP blocked after ${ipCount} failed attempts: ${ip}`);
    }

    // Progressive delay — take the higher delay
    const emailDelay = this.calculateDelay(emailCount, EMAIL_DELAY_START);
    const ipDelay = this.calculateDelay(ipCount, IP_DELAY_START);

    return { delayMs: Math.max(emailDelay, ipDelay), emailLocked };
  }

  async clearEmailCounters(email: string): Promise<void> {
    await this.redis.del(`login:sw:email:${email}`);
  }

  async shouldNotifyLock(email: string): Promise<boolean> {
    const cooldownKey = `login:lock-notify:${email}`;
    const exists = await this.redis.get(cooldownKey);
    if (exists) {
      return false;
    }
    await this.setNotifyCooldown(email);
    return true;
  }

  private async addToSlidingWindow(
    key: string,
    windowSeconds: number,
  ): Promise<number> {
    const now = Date.now();
    const windowStart = now - windowSeconds * 1000;
    const uniqueId = `${now}:${Math.random().toString(36).slice(2, 8)}`;

    const pipeline = this.redis.pipeline();
    pipeline.zremrangebyscore(key, 0, windowStart); // eskileri sil
    pipeline.zadd(key, now, uniqueId); // yeni fail ekle
    pipeline.zcard(key); // toplam say
    pipeline.expire(key, windowSeconds); // TTL güvenlik

    const results = await pipeline.exec();
    const count = results![2][1] as number; // zcard sonucu

    return count;
  }

  private async lockEmail(email: string): Promise<void> {
    await this.redis.set(`login:lock:email:${email}`, '1', 'EX', LOCK_TTL);
  }

  private async blockIp(ip: string): Promise<void> {
    await this.redis.set(`login:block:ip:${ip}`, '1', 'EX', LOCK_TTL);
  }

  private async setNotifyCooldown(email: string): Promise<void> {
    await this.redis.set(
      `login:lock-notify:${email}`,
      '1',
      'EX',
      NOTIFY_COOLDOWN_TTL,
    );
  }

  private calculateDelay(count: number, delayStart: number): number {
    if (count < delayStart) return 0;
    const delayIndex = count - delayStart;
    return Math.min(1000 * Math.pow(2, delayIndex), 8000); // max 8s
  }
}
