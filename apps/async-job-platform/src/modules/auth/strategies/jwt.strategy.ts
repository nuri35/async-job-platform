import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { JwtPayload } from '@app/common';
import { SessionService } from '../services';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    configService: ConfigService,
    private readonly sessionService: SessionService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:
        configService.get<string>('JWT_ACCESS_SECRET') ||
        'default-secret-change-me',
    });
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    // Check if token is blacklisted
    const isBlacklisted = await this.sessionService.isTokenBlacklisted(
      payload.jti,
    );
    if (isBlacklisted) {
      throw new UnauthorizedException('Token has been revoked');
    }

    // Check if session exists
    const session = await this.sessionService.getSession(
      payload.sub,
      payload.jti,
    );
    if (!session) {
      throw new UnauthorizedException('Session not found');
    }

    // Update last activity
    await this.sessionService.updateLastActivity(payload.sub, payload.jti);

    return payload;
  }
}
