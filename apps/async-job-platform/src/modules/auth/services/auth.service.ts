import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { User } from '@app/common';
import { RegisterDto, LoginDto } from '../dto';
import { IUserRepository, IRefreshTokenRepository } from '../repositories';
import { TokenService } from './token.service';
import { SessionService } from './session.service';
import { TokensResponseDto, SessionDto } from '../dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly userRepository: IUserRepository,
    private readonly refreshTokenRepository: IRefreshTokenRepository,
    private readonly tokenService: TokenService,
    private readonly sessionService: SessionService,
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
    const passwordHash = await bcrypt.hash(dto.password, 12);

    // Create user
    const user = this.userRepository.create({
      email: dto.email,
      passwordHash,
    });

    return this.userRepository.save(user);
  }

  async login(
    dto: LoginDto,
    ipAddress: string | null,
    userAgent: string | null,
  ): Promise<TokensResponseDto & { refreshToken: string }> {
    // 1. Find user
    const user = await this.userRepository.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // 2. Check if user is active
    if (!user.isActive) {
      throw new UnauthorizedException(
        'Account is disabled. Please contact support.',
      );
    }

    // 3. Verify password
    const isPasswordValid = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // 4. Generate tokens
    const { token: accessToken, jti } =
      await this.tokenService.generateAccessToken(user);
    const refreshTokenData = await this.tokenService.generateRefreshToken(
      user.id,
    );

    // 5. Save refresh token to DB
    const refreshTokenEntity = this.refreshTokenRepository.create({
      tokenHash: refreshTokenData.hash,
      userId: user.id,
      userAgent,
      ipAddress,
      expiresAt: refreshTokenData.expiresAt,
    });
    await this.refreshTokenRepository.save(refreshTokenEntity);

    // 6. Create session in Redis
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

  async validateUser(email: string, password: string): Promise<User | null> {
    const user = await this.userRepository.findByEmail(email);
    if (!user) return null;

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) return null;

    return user;
  }
}

// todo: bu endpointler plan modedakıler eklenınce her endpoint + bir skilll ile + bizim projenın sınırlılıklarını soylıyerek bu endpointlerin içerisine
// + yenı auth'A a birşey gelme ile ligil busıness + guvenlık acısından soracagıız buda spuper olacak....
