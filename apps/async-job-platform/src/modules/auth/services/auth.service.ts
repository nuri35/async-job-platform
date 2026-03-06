import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';
import { v4 as uuidv4 } from 'uuid';
import { User } from '@app/common';
import { ConfigService } from '@nestjs/config';
import { RegisterDto, LoginDto } from '../dto';
import { IUserRepository, IRefreshTokenRepository } from '../repositories';
import { TokenService } from './token.service';
import { SessionService } from './session.service';
import { EmailService } from './email.service';
import { LoginRateLimitService } from './login-rate-limit.service';
import { EmailQueueService } from './email-queue.service';
import { LoginThrottleException } from '../../../common/filters';
import { TokensResponseDto, SessionDto } from '../dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly userRepository: IUserRepository,
    private readonly refreshTokenRepository: IRefreshTokenRepository,
    private readonly tokenService: TokenService,
    private readonly sessionService: SessionService,
    private readonly emailService: EmailService,
    private readonly loginRateLimitService: LoginRateLimitService,
    private readonly emailQueueService: EmailQueueService,
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<User | null> {
    // Check if email already exists
    // Return null silently to prevent user enumeration
    const existingEmail = await this.userRepository.findByEmail(dto.email);
    if (existingEmail) {
      this.logger.debug(
        `Registration attempt with existing email: ${dto.email}`,
      );
      return null;
    }

    // Hash password
    const passwordHash = await hash(dto.password);

    // Create user
    const user = this.userRepository.create({
      email: dto.email,
      passwordHash,
    });

    const savedUser = await this.userRepository.save(user);

    try {
      await this.sendVerificationEmail(savedUser);
    } catch (error) {
      this.logger.error(
        `Verification email failed for ${savedUser.email}: ${error}`,
      );
    }
    return savedUser;
  }

  async login(
    dto: LoginDto,
    ipAddress: string | null,
    userAgent: string | null,
  ): Promise<TokensResponseDto & { refreshToken: string }> {
    // 1. Rate limit kontrolleri (mevcut logic'ten ÖNCE)
    await this.loginRateLimitService.checkIpBlocked(ipAddress || 'unknown');
    await this.loginRateLimitService.checkEmailLocked(dto.email);

    // 2. Find user
    const user = await this.userRepository.findByEmail(dto.email);
    if (!user) {
      await this.handleFailedLogin(dto.email, ipAddress);
      throw new UnauthorizedException('Invalid credentials');
    }

    // 3. Check if user is active
    if (!user.isActive) {
      this.logger.debug(`Login attempt on disabled account: ${dto.email}`);
      await this.handleFailedLogin(dto.email, ipAddress);
      throw new UnauthorizedException('Invalid credentials');
    }

    // 4. Check if email is verified
    if (!user.isEmailVerified) {
      this.logger.debug(`Login attempt with unverified email: ${dto.email}`);
      await this.handleFailedLogin(dto.email, ipAddress);
      throw new UnauthorizedException('Invalid credentials');
    }

    // 5. Verify password
    const isPasswordValid = await verify(user.passwordHash, dto.password);
    if (!isPasswordValid) {
      await this.handleFailedLogin(dto.email, ipAddress);
      throw new UnauthorizedException('Invalid credentials');
    }

    // 6. Başarılı login — email counter'ları temizle
    await this.loginRateLimitService.clearEmailCounters(dto.email);

    // 7. Generate tokens
    const { token: accessToken, jti } =
      await this.tokenService.generateAccessToken(user);
    const refreshTokenData = await this.tokenService.generateRefreshToken(
      user.id,
    );

    // 8. Save refresh token to DB
    const refreshTokenEntity = this.refreshTokenRepository.create({
      tokenHash: refreshTokenData.hash,
      userId: user.id,
      userAgent,
      ipAddress,
      expiresAt: refreshTokenData.expiresAt,
    });
    await this.refreshTokenRepository.save(refreshTokenEntity);

    // 9. Create session in Redis
    await this.sessionService.createSession(user.id, jti, {
      ipAddress,
      userAgent,
    });

    return {
      accessToken,
      expiresIn: this.tokenService.getAccessTokenExpiresIn(),
      tokenType: 'Bearer',
      refreshToken: refreshTokenData.token,
    };
  }

  private async handleFailedLogin(
    email: string,
    ipAddress: string | null,
  ): Promise<void> {
    const { delayMs, emailLocked } =
      await this.loginRateLimitService.recordFailedAttempt(
        email,
        ipAddress || 'unknown',
      );

    // Sadece lock tetiklendiğinde notify kontrolü yap
    if (emailLocked) {
      const shouldNotify =
        await this.loginRateLimitService.shouldNotifyLock(email);
      if (shouldNotify) {
        this.emailQueueService.publishLockNotification(email);
      }
    }

    // Progressive delay varsa → 429 + Retry-After, sleep yok
    if (delayMs > 0) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      throw new LoginThrottleException(Math.ceil(delayMs / 1000));
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
      userAgent: validatedToken.userAgent,
      ipAddress: validatedToken.ipAddress,
      expiresAt: newRefreshTokenData.expiresAt,
    });
    await this.refreshTokenRepository.save(newRefreshTokenEntity);

    // Create new session
    await this.sessionService.createSession(user.id, jti, {
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
    // 1. Blacklist current access token
    await this.sessionService.blacklistToken(jti);

    // 2. Delete session from Redis
    await this.sessionService.deleteSession(userId, jti);

    // 3. Revoke all refresh tokens for user (simple approach without fingerprint)
    await this.refreshTokenRepository.revokeAllByUserId(userId);
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
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
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
    await this.sessionService.deleteSession(userId, sessionId);
  }

  async verifyEmail(token: string): Promise<void> {
    const user = await this.userRepository.findOne({
      emailVerificationToken: token,
    });

    if (
      !user ||
      !user.emailVerificationExpiresAt ||
      user.emailVerificationExpiresAt < new Date()
    ) {
      throw new BadRequestException('Invalid or expired verification token');
    }

    user.isEmailVerified = true;
    user.emailVerificationToken = null;
    user.emailVerificationExpiresAt = null;
    await this.userRepository.save(user);
  }

  async resendVerificationEmail(email: string): Promise<void> {
    const user = await this.userRepository.findByEmail(email);

    // Silent return for enumeration protection
    if (!user || user.isEmailVerified) {
      return;
    }

    // Rate limit: max 3 resends per email per hour
    const rateLimitKey = `resend-verification:${email}`;
    const count = await this.sessionService.incrementRateLimit(
      rateLimitKey,
      3600,
    );
    if (count > 3) {
      this.logger.debug(
        `Resend verification rate limit exceeded for: ${email}`,
      );
      return;
    }

    await this.sendVerificationEmail(user);
  }

  async sendVerificationEmail(user: User): Promise<void> {
    const token = uuidv4();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    user.emailVerificationToken = token;
    user.emailVerificationExpiresAt = expiresAt;
    await this.userRepository.save(user);

    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';
    const verificationLink = `${frontendUrl}/verify-email?token=${token}`;

    await this.emailService.sendMail(
      user.email,
      'Verify your email address',
      `<p>Please verify your email by clicking the link below:</p>
       <p><a href="${verificationLink}">${verificationLink}</a></p>
       <p>This link expires in 24 hours.</p>`,
    );
  }

  async validateUser(email: string, password: string): Promise<User | null> {
    const user = await this.userRepository.findByEmail(email);
    if (!user) return null;

    const isPasswordValid = await verify(user.passwordHash, password);
    if (!isPasswordValid) return null;

    return user;
  }
}
