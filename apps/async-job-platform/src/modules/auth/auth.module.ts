import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { RedisModule } from '@nestjs-modules/ioredis';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { User, RefreshToken } from '@app/common';
import { RedisConfig } from '../../config';
import { AuthController } from './controllers';
import {
  AuthService,
  TokenService,
  SessionService,
  EmailService,
  LoginRateLimitService,
  EmailQueueService,
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

    ClientsModule.registerAsync([
      {
        name: 'EMAIL_SERVICE',
        imports: [ConfigModule],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.RMQ,
          options: {
            urls: [
              `amqp://${configService.get('RABBITMQ_USER')}:${configService.get('RABBITMQ_PASSWORD')}@${configService.get('RABBITMQ_HOST')}:${configService.get('RABBITMQ_PORT')}`,
            ],
            queue: 'email_queue',
            queueOptions: { durable: true },
            prefetchCount: 1,
          },
        }),
        inject: [ConfigService],
      },
    ]),
  ],
  controllers: [AuthController],
  providers: [
    // Services
    AuthService,
    TokenService,
    SessionService,
    EmailService,
    LoginRateLimitService,
    EmailQueueService,

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
