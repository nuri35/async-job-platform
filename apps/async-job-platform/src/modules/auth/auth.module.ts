import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { RedisModule } from '@nestjs-modules/ioredis';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  User,
  RefreshToken,
  PhoneVerification,
  LoginHistory,
} from '@app/common';
import { RedisConfig } from '../../config';
import { AuthController, LoginHistoryController } from './controllers';
import {
  AuthService,
  TokenService,
  SessionService,
  PhoneService,
  LoginStatsService,
  LoginHistoryService,
} from './services';
import {
  IUserRepository,
  UserRepository,
  IRefreshTokenRepository,
  RefreshTokenRepository,
  IPhoneVerificationRepository,
  PhoneVerificationRepository,
  ILoginHistoryRepository,
  LoginHistoryRepository,
} from './repositories';
import { JwtStrategy, LocalStrategy } from './strategies';
import { JwtAuthGuard, RolesGuard } from './guards';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      RefreshToken,
      PhoneVerification,
      LoginHistory,
    ]),

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
  controllers: [AuthController, LoginHistoryController],
  providers: [
    // Services
    AuthService,
    TokenService,
    SessionService,
    PhoneService,
    LoginStatsService,
    LoginHistoryService,

    // Repositories
    {
      provide: IUserRepository,
      useClass: UserRepository,
    },
    {
      provide: IRefreshTokenRepository,
      useClass: RefreshTokenRepository,
    },
    {
      provide: IPhoneVerificationRepository,
      useClass: PhoneVerificationRepository,
    },
    {
      provide: ILoginHistoryRepository,
      useClass: LoginHistoryRepository,
    },

    // Strategies
    JwtStrategy,
    LocalStrategy,

    // Guards
    JwtAuthGuard,
    RolesGuard,
  ],
  exports: [
    AuthService,
    TokenService,
    SessionService,
    JwtAuthGuard,
    RolesGuard,
    IUserRepository,
  ],
})
export class AuthModule {}
