import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { getRedisConnectionToken } from '@nestjs-modules/ioredis';
import { LoginRateLimitService } from './login-rate-limit.service';

describe('LoginRateLimitService', () => {
  let service: LoginRateLimitService;
  let redis: Record<string, jest.Mock>;

  beforeEach(async () => {
    redis = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      defineCommand: jest.fn(),
      slidingWindowCheck: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LoginRateLimitService,
        {
          provide: getRedisConnectionToken(),
          useValue: redis,
        },
      ],
    }).compile();

    service = module.get<LoginRateLimitService>(LoginRateLimitService);
  });

  describe('constructor', () => {
    it('should define slidingWindowCheck command on Redis', () => {
      expect(redis.defineCommand).toHaveBeenCalledWith('slidingWindowCheck', {
        numberOfKeys: 2,
        lua: expect.any(String),
      });
    });
  });

  describe('checkIpBlocked', () => {
    it('should pass when IP is not blocked', async () => {
      redis.get.mockResolvedValue(null);
      await expect(service.checkIpBlocked('1.2.3.4')).resolves.toBeUndefined();
      expect(redis.get).toHaveBeenCalledWith('login:block:ip:1.2.3.4');
    });

    it('should throw UnauthorizedException when IP is blocked', async () => {
      redis.get.mockResolvedValue('1');
      await expect(service.checkIpBlocked('1.2.3.4')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw with "Invalid credentials" message when blocked', async () => {
      redis.get.mockResolvedValue('1');
      await expect(service.checkIpBlocked('1.2.3.4')).rejects.toThrow(
        'Invalid credentials',
      );
    });
  });

  describe('checkEmailLocked', () => {
    it('should pass when email is not locked', async () => {
      redis.get.mockResolvedValue(null);
      await expect(
        service.checkEmailLocked('test@test.com'),
      ).resolves.toBeUndefined();
      expect(redis.get).toHaveBeenCalledWith('login:lock:email:test@test.com');
    });

    it('should throw UnauthorizedException when email is locked', async () => {
      redis.get.mockResolvedValue('1');
      await expect(service.checkEmailLocked('test@test.com')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw with "Invalid credentials" message when locked', async () => {
      redis.get.mockResolvedValue('1');
      await expect(service.checkEmailLocked('test@test.com')).rejects.toThrow(
        'Invalid credentials',
      );
    });
  });

  describe('recordFailedAttempt', () => {
    it('should call slidingWindowCheck for both email and IP', async () => {
      redis.slidingWindowCheck.mockResolvedValue([1, 0]);

      await service.recordFailedAttempt('test@test.com', '1.2.3.4');

      expect(redis.slidingWindowCheck).toHaveBeenCalledTimes(2);
      // First call: email sliding window
      expect(redis.slidingWindowCheck).toHaveBeenCalledWith(
        'login:sw:email:test@test.com',
        'login:lock:email:test@test.com',
        expect.any(Number), // now
        expect.any(Number), // windowStart
        expect.any(String), // uniqueId
        900, // windowSeconds
        5, // EMAIL_FAIL_THRESHOLD
        900, // LOCK_TTL
      );
      // Second call: IP sliding window
      expect(redis.slidingWindowCheck).toHaveBeenCalledWith(
        'login:sw:ip:1.2.3.4',
        'login:block:ip:1.2.3.4',
        expect.any(Number),
        expect.any(Number),
        expect.any(String),
        900,
        15, // IP_FAIL_THRESHOLD
        900,
      );
    });

    it('should return delayMs=0 and emailLocked=false for low fail count', async () => {
      redis.slidingWindowCheck.mockResolvedValue([1, 0]);

      const result = await service.recordFailedAttempt(
        'test@test.com',
        '1.2.3.4',
      );

      expect(result).toEqual({ delayMs: 0, emailLocked: false });
    });

    it('should return emailLocked=true when Lua script returns locked=1 for email', async () => {
      // Email: 5 fails → locked
      redis.slidingWindowCheck
        .mockResolvedValueOnce([5, 1]) // email: locked
        .mockResolvedValueOnce([1, 0]); // IP: not blocked

      const result = await service.recordFailedAttempt(
        'test@test.com',
        '1.2.3.4',
      );

      expect(result.emailLocked).toBe(true);
    });

    it('should return progressive delay for email at 3rd fail', async () => {
      // Email: count=3 (delayStart=3) → 1000ms
      redis.slidingWindowCheck
        .mockResolvedValueOnce([3, 0]) // email
        .mockResolvedValueOnce([1, 0]); // IP

      const result = await service.recordFailedAttempt(
        'test@test.com',
        '1.2.3.4',
      );

      expect(result.delayMs).toBe(1000);
    });

    it('should return progressive delay for email at 4th fail', async () => {
      // Email: count=4 → 2000ms
      redis.slidingWindowCheck
        .mockResolvedValueOnce([4, 0])
        .mockResolvedValueOnce([1, 0]);

      const result = await service.recordFailedAttempt(
        'test@test.com',
        '1.2.3.4',
      );

      expect(result.delayMs).toBe(2000);
    });

    it('should take the higher delay between email and IP', async () => {
      // Email: count=3 → 1000ms, IP: count=12 → 2000ms
      redis.slidingWindowCheck
        .mockResolvedValueOnce([3, 0]) // email
        .mockResolvedValueOnce([12, 0]); // IP

      const result = await service.recordFailedAttempt(
        'test@test.com',
        '1.2.3.4',
      );

      expect(result.delayMs).toBe(2000);
    });
  });

  describe('calculateDelay (via recordFailedAttempt)', () => {
    // Testing private calculateDelay through the public API

    it('should return 0 delay for count below delayStart', async () => {
      redis.slidingWindowCheck.mockResolvedValue([2, 0]); // count=2, email delay starts at 3
      const result = await service.recordFailedAttempt('a@b.com', '1.1.1.1');
      expect(result.delayMs).toBe(0);
    });

    it('should return 1000ms at email delayStart (count=3)', async () => {
      redis.slidingWindowCheck
        .mockResolvedValueOnce([3, 0])
        .mockResolvedValueOnce([1, 0]);
      const result = await service.recordFailedAttempt('a@b.com', '1.1.1.1');
      expect(result.delayMs).toBe(1000);
    });

    it('should return 2000ms at count=4 for email', async () => {
      redis.slidingWindowCheck
        .mockResolvedValueOnce([4, 0])
        .mockResolvedValueOnce([1, 0]);
      const result = await service.recordFailedAttempt('a@b.com', '1.1.1.1');
      expect(result.delayMs).toBe(2000);
    });

    it('should return 1000ms at IP delayStart (count=11)', async () => {
      redis.slidingWindowCheck
        .mockResolvedValueOnce([1, 0]) // email: no delay
        .mockResolvedValueOnce([11, 0]); // IP: count=11, delay start=11
      const result = await service.recordFailedAttempt('a@b.com', '1.1.1.1');
      expect(result.delayMs).toBe(1000);
    });

    it('should return 4000ms at IP count=13', async () => {
      redis.slidingWindowCheck
        .mockResolvedValueOnce([1, 0])
        .mockResolvedValueOnce([13, 0]); // IP: 13-11=2 → 2^2*1000 = 4000
      const result = await service.recordFailedAttempt('a@b.com', '1.1.1.1');
      expect(result.delayMs).toBe(4000);
    });

    it('should cap delay at 8000ms', async () => {
      redis.slidingWindowCheck
        .mockResolvedValueOnce([1, 0])
        .mockResolvedValueOnce([20, 0]); // IP: very high count
      const result = await service.recordFailedAttempt('a@b.com', '1.1.1.1');
      expect(result.delayMs).toBe(8000);
    });
  });

  describe('clearEmailCounters', () => {
    it('should delete the email sliding window key', async () => {
      redis.del.mockResolvedValue(1);

      await service.clearEmailCounters('test@test.com');

      expect(redis.del).toHaveBeenCalledWith('login:sw:email:test@test.com');
    });
  });

  describe('shouldNotifyLock', () => {
    it('should return true when cooldown key does not exist (SET NX succeeds)', async () => {
      redis.set.mockResolvedValue('OK');

      const result = await service.shouldNotifyLock('test@test.com');

      expect(result).toBe(true);
      expect(redis.set).toHaveBeenCalledWith(
        'login:lock-notify:test@test.com',
        '1',
        'EX',
        3600,
        'NX',
      );
    });

    it('should return false when cooldown key already exists (SET NX fails)', async () => {
      redis.set.mockResolvedValue(null);

      const result = await service.shouldNotifyLock('test@test.com');

      expect(result).toBe(false);
    });
  });
});
