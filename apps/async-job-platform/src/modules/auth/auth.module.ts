import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { RedisModule } from '@nestjs-modules/ioredis';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { User, RefreshToken } from '@app/common';
import { RedisConfig } from '../../config';
import { AuthController } from './controllers';
import {
  AuthService,
  TokenService,
  SessionService,
  EmailService,
} from './services';
import {
  IUserRepository,
  UserRepository,
  IRefreshTokenRepository,
  RefreshTokenRepository,
} from './repositories';
import { JwtStrategy, LocalStrategy } from './strategies';
import {
  JwtAuthGuard,
  RolesGuard,
  EmailVerifiedGuard,
  RegisterRateLimitGuard,
} from './guards';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, RefreshToken]),

    PassportModule.register({ defaultStrategy: 'jwt' }),

    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService): JwtModuleOptions => {
        const expiresIn =
          configService.get<string>('JWT_ACCESS_EXPIRES_IN') || '15m';
        return {
          secret:
            configService.get<string>('JWT_ACCESS_SECRET') ||
            'default-secret-change-me',
          signOptions: {
            expiresIn: expiresIn as `${number}${'s' | 'm' | 'h' | 'd'}`,
          },
        };
      },
      inject: [ConfigService],
    }),

    RedisModule.forRootAsync({
      useClass: RedisConfig,
    }),
  ],
  controllers: [AuthController],
  providers: [
    // Services
    AuthService,
    TokenService,
    SessionService,
    EmailService,

    // Repositories
    {
      provide: IUserRepository,
      useClass: UserRepository,
    },
    {
      provide: IRefreshTokenRepository,
      useClass: RefreshTokenRepository,
    },

    // Strategies
    JwtStrategy,
    LocalStrategy,

    // Guards
    JwtAuthGuard,
    RolesGuard,
    EmailVerifiedGuard,
    RegisterRateLimitGuard,
  ],
  exports: [
    AuthService,
    TokenService,
    SessionService,
    EmailService,
    JwtAuthGuard,
    RolesGuard,
    EmailVerifiedGuard,
    IUserRepository,
  ],
})
export class AuthModule {}
