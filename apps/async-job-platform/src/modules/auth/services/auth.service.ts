import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { User, LoginStatus, LoginFailureReason } from '@app/common';
import { RegisterDto, LoginDto } from '../dto';
import { IUserRepository, IRefreshTokenRepository } from '../repositories';
import { TokenService } from './token.service';
import { SessionService } from './session.service';
import { PhoneService } from './phone.service';
import { LoginHistoryService } from './login-history.service';
import { RiskTrackingService, AttemptStatus } from './risk-tracking.service';
import { TokensResponseDto, SessionDto } from '../dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly maxDevices: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly userRepository: IUserRepository,
    private readonly refreshTokenRepository: IRefreshTokenRepository,
    private readonly tokenService: TokenService,
    private readonly sessionService: SessionService,
    @Inject(forwardRef(() => PhoneService))
    private readonly phoneService: PhoneService,
    private readonly loginHistoryService: LoginHistoryService,
    private readonly riskTrackingService: RiskTrackingService,
  ) {
    this.maxDevices = this.configService.get<number>('MAX_DEVICES_PER_USER', 3);
  }

  async register(dto: RegisterDto): Promise<User> {
    // Check if email exists
    const existingUser = await this.userRepository.findByEmail(dto.email);
    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    // Check if phone exists
    if (dto.phone) {
      const existingPhone = await this.userRepository.findByPhone(dto.phone);
      if (existingPhone) {
        throw new ConflictException('Phone number already registered');
      }
    }

    // Hash password
    const passwordHash = await bcrypt.hash(dto.password, 12);

    // Create user
    const user = this.userRepository.create({
      email: dto.email,
      passwordHash,
      phone: dto.phone || null,
      phoneVerified: dto.phone ? false : true, // No phone = no verification needed
    });

    const savedUser = await this.userRepository.save(user);

    // Send verification SMS if phone provided
    if (dto.phone) {
      try {
        await this.phoneService.sendVerificationCode(dto.phone);
      } catch (error) {
        // Log but don't fail registration - user can resend later
        this.logger.warn(
          `Failed to send verification SMS to ${dto.phone}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    }

    return savedUser;
  }
  async login(
    dto: LoginDto,
    ipAddress: string | null,
    userAgent: string | null,
  ): Promise<TokensResponseDto & { refreshToken: string }> {
    const { email, deviceFingerprint } = dto;

    // Helper to build device info for login history
    const deviceInfo = {
      ipAddress,
      userAgent,
      deviceFingerprint,
      deviceName: dto.deviceName,
    };

    // 1. Fingerprint-based rate limiting (general protection)
    // Prevents same device from brute-forcing different emails
    const fpRateLimitKey = `login:fp:${deviceFingerprint}`;
    const fpAttempts = await this.sessionService.incrementRateLimit(
      fpRateLimitKey,
      15 * 60, // 15 minutes window
    );
    if (fpAttempts > 20) {
      // Record rate limited attempt
      await this.loginHistoryService.recordLogin({
        userId: null,
        email,
        status: LoginStatus.FAILED,
        failureReason: LoginFailureReason.RATE_LIMITED,
        deviceInfo,
      });
      await this.recordRiskAttempt(
        ipAddress,
        email,
        deviceFingerprint,
        AttemptStatus.FAILED,
      );
      throw new BadRequestException(
        'Too many login attempts from this device. Please try again later.',
      );
    }

    // 2. Check if device is blocked for this email (5 failed attempts within 1 hour)
    const isDeviceBlocked = await this.sessionService.isDeviceBlocked(
      email,
      deviceFingerprint,
    );
    if (isDeviceBlocked) {
      // Record device blocked attempt
      await this.loginHistoryService.recordLogin({
        userId: null,
        email,
        status: LoginStatus.FAILED,
        failureReason: LoginFailureReason.DEVICE_BLOCKED,
        deviceInfo,
      });
      await this.recordRiskAttempt(
        ipAddress,
        email,
        deviceFingerprint,
        AttemptStatus.FAILED,
      );
      throw new ForbiddenException(
        'Too many failed attempts from this device. Please try again after 1 hour.',
      );
    }

    // 3. Find user
    const user = await this.userRepository.findByEmail(email);
    if (!user) {
      // Increment device attempts even for non-existent user (prevent enumeration)
      await this.handleFailedLogin(email, deviceFingerprint);
      // Record invalid credentials (user not found)
      await this.loginHistoryService.recordLogin({
        userId: null,
        email,
        status: LoginStatus.FAILED,
        failureReason: LoginFailureReason.INVALID_CREDENTIALS,
        deviceInfo,
      });
      await this.recordRiskAttempt(
        ipAddress,
        email,
        deviceFingerprint,
        AttemptStatus.FAILED,
      );
      throw new UnauthorizedException('Invalid credentials');
    }

    // 4. Check if user is active
    if (!user.isActive) {
      // Record account disabled attempt
      await this.loginHistoryService.recordLogin({
        userId: user.id,
        email,
        status: LoginStatus.FAILED,
        failureReason: LoginFailureReason.ACCOUNT_DISABLED,
        deviceInfo,
      });
      await this.recordRiskAttempt(
        ipAddress,
        email,
        deviceFingerprint,
        AttemptStatus.FAILED,
      );
      throw new UnauthorizedException(
        'Account is disabled. Please contact support.',
      );
    }

    // 5. Verify password
    const isPasswordValid = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );
    if (!isPasswordValid) {
      await this.handleFailedLogin(email, deviceFingerprint, user);
      // Record invalid credentials (wrong password)
      await this.loginHistoryService.recordLogin({
        userId: user.id,
        email,
        status: LoginStatus.FAILED,
        failureReason: LoginFailureReason.INVALID_CREDENTIALS,
        deviceInfo,
      });
      await this.recordRiskAttempt(
        ipAddress,
        email,
        deviceFingerprint,
        AttemptStatus.FAILED,
      );
      throw new UnauthorizedException('Invalid credentials');
    }

    // 6. Check phone verification (if phone exists)
    if (user.phone && !user.phoneVerified) {
      // Record phone not verified attempt
      await this.loginHistoryService.recordLogin({
        userId: user.id,
        email,
        status: LoginStatus.FAILED,
        failureReason: LoginFailureReason.PHONE_NOT_VERIFIED,
        deviceInfo,
      });
      await this.recordRiskAttempt(
        ipAddress,
        email,
        deviceFingerprint,
        AttemptStatus.FAILED,
      );
      throw new ForbiddenException('Phone number not verified');
    }

    const existingSession = await this.sessionService.findSessionByFingerprint(
      user.id,
      deviceFingerprint,
    );

    if (existingSession) {
      // Same device - revoke old session and create new one
      await this.sessionService.blacklistToken(existingSession.jti);
      await this.sessionService.deleteSession(user.id, existingSession.jti);
      await this.refreshTokenRepository.revokeByDeviceFingerprint(
        user.id,
        deviceFingerprint,
      );
      this.logger.log(
        `Replaced existing session for user ${user.id} on device ${deviceFingerprint}`,
      );
    } else {
      // New device - check device limit
      const activeSessionsCount = await this.sessionService.countSessions(
        user.id,
      );
      if (activeSessionsCount >= this.maxDevices) {
        // Record max devices reached attempt
        await this.loginHistoryService.recordLogin({
          userId: user.id,
          email,
          status: LoginStatus.FAILED,
          failureReason: LoginFailureReason.MAX_DEVICES_REACHED,
          deviceInfo,
        });
        await this.recordRiskAttempt(
          ipAddress,
          email,
          deviceFingerprint,
          AttemptStatus.FAILED,
        );
        throw new ForbiddenException(
          `Maximum ${this.maxDevices} devices allowed. Please logout from another device.`,
        );
      }
    }

    // 8. Generate tokens
    const { token: accessToken, jti } =
      await this.tokenService.generateAccessToken(user);
    const refreshTokenData = await this.tokenService.generateRefreshToken(
      user.id,
    );

    // 9. Save refresh token to DB
    const refreshTokenEntity = this.refreshTokenRepository.create({
      tokenHash: refreshTokenData.hash,
      userId: user.id,
      deviceFingerprint,
      deviceName: dto.deviceName,
      userAgent,
      ipAddress,
      expiresAt: refreshTokenData.expiresAt,
    });
    await this.refreshTokenRepository.save(refreshTokenEntity);

    // 10. Create session in Redis
    await this.sessionService.createSession(user.id, jti, {
      deviceFingerprint,
      deviceName: dto.deviceName,
      ipAddress,
      userAgent,
    });

    // 11. Reset rate limits on successful login
    await this.sessionService.resetRateLimit(fpRateLimitKey);
    await this.sessionService.resetDeviceLoginAttempts(
      email,
      deviceFingerprint,
    );

    // 12. Record successful login
    await this.loginHistoryService.recordLogin({
      userId: user.id,
      email,
      status: LoginStatus.SUCCESS,
      sessionJti: jti,
      deviceInfo,
    });
    await this.recordRiskAttempt(
      ipAddress,
      email,
      deviceFingerprint,
      AttemptStatus.SUCCESS,
    );

    return {
      accessToken,
      expiresIn: this.tokenService.getAccessTokenExpiresIn(),
      tokenType: 'Bearer',
      refreshToken: refreshTokenData.token,
    };
  }

  private async handleFailedLogin(
    email: string,
    deviceFingerprint: string,
    user?: User,
  ): Promise<void> {
    // Increment device login attempts
    const attempts = await this.sessionService.incrementDeviceLoginAttempts(
      email,
      deviceFingerprint,
    );

    // If reached max attempts, increment block count
    if (attempts >= 5) {
      const blockCount = await this.sessionService.incrementDeviceBlockCount(
        email,
        deviceFingerprint,
      );

      this.logger.warn(
        `Device ${deviceFingerprint} blocked for email ${email}. Block count: ${blockCount}`,
      );

      // If reached max blocks, deactivate account (only if still active)
      if (blockCount >= 3 && user && user.isActive) {
        await this.userRepository.deactivate(user.id);
        this.logger.error(
          `Account ${email} deactivated due to too many failed login attempts`,
        );
        // TODO: Send email notification to user about account deactivation
      }
    }
  }

  async refresh(
    refreshToken: string,
    currentJti: string | null,
  ): Promise<TokensResponseDto & { refreshToken: string }> {
    // Verify refresh token (JWT signature check)
    const payload = await this.tokenService.verifyRefreshToken(refreshToken);
    if (!payload) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Find refresh token by hash (direct DB query with SHA-256)
    const tokenHash = this.tokenService.hashRefreshToken(refreshToken);
    const validatedToken =
      await this.refreshTokenRepository.findByTokenHash(tokenHash);

    if (!validatedToken || validatedToken.userId !== payload.sub) {
      throw new UnauthorizedException('Refresh token not found or revoked');
    }

    // Get user
    const user = await this.userRepository.findById(payload.sub);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or disabled');
    }

    // Blacklist old access token if provided
    if (currentJti) {
      await this.sessionService.blacklistToken(currentJti);
      await this.sessionService.deleteSession(user.id, currentJti);
    }

    // Revoke old refresh token (rotation)
    await this.refreshTokenRepository.revokeById(validatedToken.id);

    // Generate new tokens
    const { token: accessToken, jti } =
      await this.tokenService.generateAccessToken(user);
    const newRefreshTokenData = await this.tokenService.generateRefreshToken(
      user.id,
    );

    // Save new refresh token
    const newRefreshTokenEntity = this.refreshTokenRepository.create({
      tokenHash: newRefreshTokenData.hash,
      userId: user.id,
      deviceFingerprint: validatedToken.deviceFingerprint,
      deviceName: validatedToken.deviceName,
      userAgent: validatedToken.userAgent,
      ipAddress: validatedToken.ipAddress,
      expiresAt: newRefreshTokenData.expiresAt,
    });
    await this.refreshTokenRepository.save(newRefreshTokenEntity);

    // Create new session
    await this.sessionService.createSession(user.id, jti, {
      deviceFingerprint: validatedToken.deviceFingerprint,
      deviceName: validatedToken.deviceName,
      ipAddress: validatedToken.ipAddress,
      userAgent: validatedToken.userAgent,
    });

    return {
      accessToken,
      expiresIn: this.tokenService.getAccessTokenExpiresIn(),
      tokenType: 'Bearer',
      refreshToken: newRefreshTokenData.token,
    };
  }

  async logout(userId: string, jti: string): Promise<void> {
    // 1. Get session first (need fingerprint for refresh token revocation)
    const session = await this.sessionService.getSession(userId, jti);

    // 2. Blacklist current access token
    await this.sessionService.blacklistToken(jti);

    // 3. Delete session from Redis
    await this.sessionService.deleteSession(userId, jti);

    // 4. Revoke refresh token for this session (by device fingerprint)
    if (session) {
      await this.refreshTokenRepository.revokeByDeviceFingerprint(
        userId,
        session.deviceFingerprint,
      );
    }
  }

  async logoutAll(userId: string): Promise<void> {
    // 1. Get all sessions first (without deleting)
    const sessions = await this.sessionService.getAllSessions(userId);
    const jtis = sessions.map((s) => s.jti);

    // 2. Blacklist all tokens
    await this.sessionService.blacklistMultipleTokens(jtis);

    // 3. Delete all sessions from Redis
    await this.sessionService.deleteAllSessions(userId);

    // 4. Revoke all refresh tokens
    await this.refreshTokenRepository.revokeAllByUserId(userId);
  }

  async getSessions(userId: string, currentJti: string): Promise<SessionDto[]> {
    const sessions = await this.sessionService.getAllSessions(userId);

    return sessions.map(({ jti, data }) => ({
      id: jti,
      deviceFingerprint: data.deviceFingerprint,
      deviceName: data.deviceName,
      ipAddress: data.ipAddress,
      createdAt: new Date(data.createdAt),
      current: jti === currentJti,
    }));
  }

  async revokeSession(
    userId: string,
    sessionId: string,
    currentJti: string,
  ): Promise<void> {
    if (sessionId === currentJti) {
      throw new BadRequestException(
        'Cannot revoke current session. Use logout instead.',
      );
    }

    // Blacklist the token
    await this.sessionService.blacklistToken(sessionId);

    // Delete session
    const session = await this.sessionService.getSession(userId, sessionId);
    if (session) {
      await this.sessionService.deleteSession(userId, sessionId);
      await this.refreshTokenRepository.revokeByDeviceFingerprint(
        userId,
        session.deviceFingerprint,
      );
    }
  }

  async validateUser(email: string, password: string): Promise<User | null> {
    const user = await this.userRepository.findByEmail(email);
    if (!user) return null;

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) return null;

    return user;
  }

  private async recordRiskAttempt(
    ipAddress: string | null,
    email: string,
    fingerprint: string,
    status: AttemptStatus,
  ): Promise<void> {
    if (!ipAddress) return;

    await this.riskTrackingService.recordAttempt({
      ip: ipAddress,
      email,
      fingerprint,
      status,
    });
  }
}
