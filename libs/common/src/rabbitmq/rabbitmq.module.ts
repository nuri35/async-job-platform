import { DynamicModule, Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RMQ_EXCHANGE } from './rabbitmq.constants';

@Module({})
export class RabbitmqModule {
  /**
   * RabbitMQ URL'ini oluşturur.
   * Tekrar kullanım için static helper.
   */
  static buildUrl(configService: ConfigService): string {
    const user = configService.get<string>('RABBITMQ_USER', 'guest');
    const pass = configService.get<string>('RABBITMQ_PASSWORD', 'guest');
    const host = configService.get<string>('RABBITMQ_HOST', 'localhost');
    const port = configService.get<number>('RABBITMQ_PORT', 5672);
    return `amqp://${user}:${pass}@${host}:${port}`;
  }

  /**
   * Root seviyede RabbitMQ bağlantı bilgilerini sağlar.
   * app.module.ts'de bir kez çağrılır.
   */
  static forRoot(): DynamicModule {
    return {
      module: RabbitmqModule,
      global: true,
      imports: [ConfigModule],
      providers: [
        {
          provide: 'RMQ_CONNECTION_OPTIONS',
          useFactory: (configService: ConfigService) => ({
            urls: [RabbitmqModule.buildUrl(configService)],
            exchange: RMQ_EXCHANGE.NAME,
            exchangeType: RMQ_EXCHANGE.TYPE,
          }),
          inject: [ConfigService],
        },
      ],
      exports: ['RMQ_CONNECTION_OPTIONS'],
    };
  }

  /**
   * Belirli bir queue için ClientProxy sağlar.
   * İhtiyacı olan module kendi queue'su için çağırır.
   *
   * Topic exchange üzerinden publish yapar.
   * Queue adı burada sadece assert/declare için kullanılır.
   * Gerçek routing, publish sırasında routing key ile olur.
   *
   * using: RabbitmqModule.forFeature(RMQ_TOKENS.EMAIL, QUEUE_NAMES.EMAIL)
   */
  static forFeature(tokenName: string, queueName: string): DynamicModule {
    return {
      module: RabbitmqModule,
      imports: [
        ClientsModule.registerAsync([
          {
            name: tokenName,
            imports: [ConfigModule],
            useFactory: (configService: ConfigService) => ({
              transport: Transport.RMQ,
              options: {
                urls: [RabbitmqModule.buildUrl(configService)],
                queue: queueName,
                queueOptions: {
                  durable: true,
                  arguments: {
                    'x-dead-letter-exchange': '',
                    'x-dead-letter-routing-key': `${queueName}_dlq`,
                  },
                },
                exchange: RMQ_EXCHANGE.NAME,
                exchangeType: RMQ_EXCHANGE.TYPE,
                prefetchCount: 1,
              },
            }),
            inject: [ConfigService],
          },
        ]),
      ],
      exports: [ClientsModule],
    };
  }
}
