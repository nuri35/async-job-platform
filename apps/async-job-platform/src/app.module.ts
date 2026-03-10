import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_GUARD } from '@nestjs/core';
import { RabbitmqModule } from '@app/common';
import { DatabaseConfig } from './config';
import {
  JobsModule,
  AuthModule,
  JwtAuthGuard,
  EmailConsumerModule,
} from './modules';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    TypeOrmModule.forRootAsync({
      useClass: DatabaseConfig,
    }),

    RabbitmqModule.forRoot(),

    AuthModule,
    JobsModule,
    EmailConsumerModule,
  ],
  providers: [
    // Global JWT Auth Guard - all routes require authentication by default
    // Use @Public() decorator to make routes public
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
