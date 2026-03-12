import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';
import { SessionService } from './session.service';
import { LoginRateLimitService } from './login-rate-limit.service';
import { EmailQueueService } from './email-queue.service';
import { IUserRepository } from '../repositories/user.repository.interface';
import { IRefreshTokenRepository } from '../repositories/refresh-token.repository.interface';
import { EmailService, User } from '@app/common';
import { LoginThrottleException } from '../../../common/filters';

// Mock @node-rs/argon2 to avoid native module issues in tests
const mockVerify = jest.fn();
const mockHash = jest.fn();
jest.mock('@node-rs/argon2', () => ({
  verify: (...args: unknown[]) => mockVerify(...args),
  hash: (...args: unknown[]) => mockHash(...args),
}));

// Mock uuid to avoid ESM import issues
jest.mock('uuid', () => ({
  v4: () => 'mock-uuid-v4',
}));

describe('AuthService', () => {
  let service: AuthService;
  let userRepository: Record<string, jest.Mock>;
  let refreshTokenRepository: Record<string, jest.Mock>;
  let tokenService: Record<string, jest.Mock>;
  let sessionService: Record<string, jest.Mock>;
  let emailService: Record<string, jest.Mock>;
  let loginRateLimitService: Record<string, jest.Mock>;
  let emailQueueService: Record<string, jest.Mock>;
  let configService: Record<string, jest.Mock>;

  const createMockUser = (overrides: Partial<User> = {}): User =>
    ({
      id: 'user-uuid-1',
      email: 'test@test.com',
      passwordHash: 'hashed-password',
      isActive: true,
      isEmailVerified: true,
      ...overrides,
    }) as User;

  beforeEach(async () => {
    userRepository = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    refreshTokenRepository = {
      create: jest.fn(),
      save: jest.fn(),
      findByTokenHash: jest.fn(),
      revokeById: jest.fn(),
      revokeAllByUserId: jest.fn(),
    };

    tokenService = {
      generateAccessToken: jest.fn(),
      generateRefreshToken: jest.fn(),
      getAccessTokenExpiresIn: jest.fn(),
      verifyRefreshToken: jest.fn(),
      hashRefreshToken: jest.fn(),
    };

    sessionService = {
      createSession: jest.fn(),
      deleteSession: jest.fn(),
      deleteAllSessions: jest.fn(),
      blacklistToken: jest.fn(),
      blacklistMultipleTokens: jest.fn(),
      getAllSessions: jest.fn(),
      incrementRateLimit: jest.fn(),
    };

    emailService = {
      sendMail: jest.fn(),
    };

    loginRateLimitService = {
      checkIpBlocked: jest.fn(),
      checkEmailLocked: jest.fn(),
      recordFailedAttempt: jest.fn(),
      clearEmailCounters: jest.fn(),
      shouldNotifyLock: jest.fn(),
    };

    emailQueueService = {
      publishLockNotification: jest.fn(),
    };

    configService = {
      get: jest.fn().mockReturnValue('http://localhost:3000'),
    };

    // Default: verify returns false (wrong password)
    mockVerify.mockReset();
    mockVerify.mockResolvedValue(false);
    mockHash.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: IUserRepository, useValue: userRepository },
        { provide: IRefreshTokenRepository, useValue: refreshTokenRepository },
        { provide: TokenService, useValue: tokenService },
        { provide: SessionService, useValue: sessionService },
        { provide: EmailService, useValue: emailService },
        { provide: LoginRateLimitService, useValue: loginRateLimitService },
        { provide: EmailQueueService, useValue: emailQueueService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('login', () => {
    const loginDto = { email: 'test@test.com', password: 'password123' };
    const ipAddress = '192.168.1.1';
    const userAgent = 'jest-test';

    beforeEach(() => {
      // Default: rate limit checks pass
      loginRateLimitService.checkIpBlocked.mockResolvedValue(undefined);
      loginRateLimitService.checkEmailLocked.mockResolvedValue(undefined);
      loginRateLimitService.recordFailedAttempt.mockResolvedValue({
        delayMs: 0,
        emailLocked: false,
      });
      loginRateLimitService.shouldNotifyLock.mockResolvedValue(false);
    });

    describe('rate limit checks', () => {
      it('should check IP blocked before anything else', async () => {
        loginRateLimitService.checkIpBlocked.mockRejectedValue(
          new UnauthorizedException('Invalid credentials'),
        );

        await expect(
          service.login(loginDto, ipAddress, userAgent),
        ).rejects.toThrow(UnauthorizedException);

        expect(loginRateLimitService.checkIpBlocked).toHaveBeenCalledWith(
          ipAddress,
        );
        // User lookup should NOT have happened
        expect(userRepository.findByEmail).not.toHaveBeenCalled();
      });

      it('should check email locked before user lookup', async () => {
        loginRateLimitService.checkEmailLocked.mockRejectedValue(
          new UnauthorizedException('Invalid credentials'),
        );

        await expect(
          service.login(loginDto, ipAddress, userAgent),
        ).rejects.toThrow(UnauthorizedException);

        expect(loginRateLimitService.checkEmailLocked).toHaveBeenCalledWith(
          loginDto.email,
        );
        expect(userRepository.findByEmail).not.toHaveBeenCalled();
      });
    });

    describe('user not found', () => {
      it('should throw UnauthorizedException with "Invalid credentials"', async () => {
        userRepository.findByEmail.mockResolvedValue(null);

        await expect(
          service.login(loginDto, ipAddress, userAgent),
        ).rejects.toThrow('Invalid credentials');
      });

      it('should record failed attempt when user not found', async () => {
        userRepository.findByEmail.mockResolvedValue(null);

        await expect(
          service.login(loginDto, ipAddress, userAgent),
        ).rejects.toThrow(UnauthorizedException);

        expect(loginRateLimitService.recordFailedAttempt).toHaveBeenCalledWith(
          loginDto.email,
          ipAddress,
        );
      });
    });

    describe('disabled account (isActive=false)', () => {
      it('should throw UnauthorizedException with same "Invalid credentials" message', async () => {
        const disabledUser = createMockUser({ isActive: false });
        userRepository.findByEmail.mockResolvedValue(disabledUser);

        await expect(
          service.login(loginDto, ipAddress, userAgent),
        ).rejects.toThrow('Invalid credentials');
      });

      it('should record failed attempt for disabled account', async () => {
        const disabledUser = createMockUser({ isActive: false });
        userRepository.findByEmail.mockResolvedValue(disabledUser);

        await expect(
          service.login(loginDto, ipAddress, userAgent),
        ).rejects.toThrow(UnauthorizedException);

        expect(loginRateLimitService.recordFailedAttempt).toHaveBeenCalledWith(
          loginDto.email,
          ipAddress,
        );
      });
    });

    describe('unverified email (isEmailVerified=false)', () => {
      it('should throw UnauthorizedException with "Invalid credentials"', async () => {
        const unverifiedUser = createMockUser({ isEmailVerified: false });
        userRepository.findByEmail.mockResolvedValue(unverifiedUser);

        await expect(
          service.login(loginDto, ipAddress, userAgent),
        ).rejects.toThrow('Invalid credentials');
      });

      it('should record failed attempt for unverified email', async () => {
        const unverifiedUser = createMockUser({ isEmailVerified: false });
        userRepository.findByEmail.mockResolvedValue(unverifiedUser);

        await expect(
          service.login(loginDto, ipAddress, userAgent),
        ).rejects.toThrow(UnauthorizedException);

        expect(loginRateLimitService.recordFailedAttempt).toHaveBeenCalledWith(
          loginDto.email,
          ipAddress,
        );
      });

      it('should use same error message as disabled account (enumeration protection)', async () => {
        const unverifiedUser = createMockUser({ isEmailVerified: false });
        const disabledUser = createMockUser({ isActive: false });

        userRepository.findByEmail.mockResolvedValue(unverifiedUser);
        let unverifiedError: Error | undefined;
        try {
          await service.login(loginDto, ipAddress, userAgent);
        } catch (e) {
          unverifiedError = e as Error;
        }

        userRepository.findByEmail.mockResolvedValue(disabledUser);
        let disabledError: Error | undefined;
        try {
          await service.login(loginDto, ipAddress, userAgent);
        } catch (e) {
          disabledError = e as Error;
        }

        expect(unverifiedError?.message).toBe(disabledError?.message);
      });
    });

    describe('wrong password', () => {
      it('should throw UnauthorizedException with "Invalid credentials"', async () => {
        const user = createMockUser();
        userRepository.findByEmail.mockResolvedValue(user);
        mockVerify.mockResolvedValue(false);

        await expect(
          service.login(loginDto, ipAddress, userAgent),
        ).rejects.toThrow('Invalid credentials');
      });

      it('should record failed attempt on wrong password', async () => {
        const user = createMockUser();
        userRepository.findByEmail.mockResolvedValue(user);
        mockVerify.mockResolvedValue(false);

        await expect(
          service.login(loginDto, ipAddress, userAgent),
        ).rejects.toThrow(UnauthorizedException);

        expect(loginRateLimitService.recordFailedAttempt).toHaveBeenCalled();
      });
    });

    describe('handleFailedLogin side effects', () => {
      it('should publish lock notification when email gets locked and shouldNotify=true', async () => {
        userRepository.findByEmail.mockResolvedValue(null);
        loginRateLimitService.recordFailedAttempt.mockResolvedValue({
          delayMs: 0,
          emailLocked: true,
        });
        loginRateLimitService.shouldNotifyLock.mockResolvedValue(true);

        await expect(
          service.login(loginDto, ipAddress, userAgent),
        ).rejects.toThrow(UnauthorizedException);

        expect(emailQueueService.publishLockNotification).toHaveBeenCalledWith(
          loginDto.email,
        );
      });

      it('should NOT publish lock notification when emailLocked=false', async () => {
        userRepository.findByEmail.mockResolvedValue(null);
        loginRateLimitService.recordFailedAttempt.mockResolvedValue({
          delayMs: 0,
          emailLocked: false,
        });

        await expect(
          service.login(loginDto, ipAddress, userAgent),
        ).rejects.toThrow(UnauthorizedException);

        expect(
          emailQueueService.publishLockNotification,
        ).not.toHaveBeenCalled();
      });

      it('should NOT publish lock notification when shouldNotify=false (cooldown active)', async () => {
        userRepository.findByEmail.mockResolvedValue(null);
        loginRateLimitService.recordFailedAttempt.mockResolvedValue({
          delayMs: 0,
          emailLocked: true,
        });
        loginRateLimitService.shouldNotifyLock.mockResolvedValue(false);

        await expect(
          service.login(loginDto, ipAddress, userAgent),
        ).rejects.toThrow(UnauthorizedException);

        expect(
          emailQueueService.publishLockNotification,
        ).not.toHaveBeenCalled();
      });

      it('should throw LoginThrottleException when delayMs > 0', async () => {
        userRepository.findByEmail.mockResolvedValue(null);
        loginRateLimitService.recordFailedAttempt.mockResolvedValue({
          delayMs: 2000,
          emailLocked: false,
        });

        await expect(
          service.login(loginDto, ipAddress, userAgent),
        ).rejects.toThrow(LoginThrottleException);
      });
    });

    describe('successful login', () => {
      let validUser: User;

      beforeEach(() => {
        validUser = createMockUser({ passwordHash: 'valid-hash' });
        mockVerify.mockResolvedValue(true);

        userRepository.findByEmail.mockResolvedValue(validUser);
        tokenService.generateAccessToken.mockResolvedValue({
          token: 'access-token',
          jti: 'jti-123',
        });
        tokenService.generateRefreshToken.mockResolvedValue({
          token: 'refresh-token',
          hash: 'refresh-hash',
          expiresAt: new Date(),
        });
        tokenService.getAccessTokenExpiresIn.mockReturnValue(900);
        refreshTokenRepository.create.mockReturnValue({});
        refreshTokenRepository.save.mockResolvedValue({});
        sessionService.createSession.mockResolvedValue(undefined);
      });

      it('should clear email counters on successful login', async () => {
        const result = await service.login(loginDto, ipAddress, userAgent);

        expect(loginRateLimitService.clearEmailCounters).toHaveBeenCalledWith(
          loginDto.email,
        );
        expect(result.accessToken).toBe('access-token');
      });

      it('should NOT call recordFailedAttempt on success', async () => {
        await service.login(loginDto, ipAddress, userAgent);

        expect(
          loginRateLimitService.recordFailedAttempt,
        ).not.toHaveBeenCalled();
      });

      it('should return tokens response with correct shape', async () => {
        const result = await service.login(loginDto, ipAddress, userAgent);

        expect(result).toEqual({
          accessToken: 'access-token',
          expiresIn: 900,
          tokenType: 'Bearer',
          refreshToken: 'refresh-token',
        });
      });

      it('should create session in Redis', async () => {
        await service.login(loginDto, ipAddress, userAgent);

        expect(sessionService.createSession).toHaveBeenCalledWith(
          validUser.id,
          'jti-123',
          { ipAddress, userAgent },
        );
      });
    });
  });
});
