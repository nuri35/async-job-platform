import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { ValidationPipe, Logger, VersioningType } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from '@fastify/helmet';
import fastifyCors from '@fastify/cors';
import fastifyCompress from '@fastify/compress';
import fastifyCookie from '@fastify/cookie';
import fastifyRateLimit from '@fastify/rate-limit';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger: process.env.NODE_ENV !== 'production',
      trustProxy: true,
    }),
  );

  // Global prefix
  app.setGlobalPrefix('api');

  // API Versioning
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  // Security - Helmet
  await app.register(helmet, {
    contentSecurityPolicy: process.env.NODE_ENV === 'production',
    crossOriginEmbedderPolicy: false,
  });

  // CORS
  await app.register(fastifyCors, {
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'X-Request-Id',
    ],
  });

  // Compression
  await app.register(fastifyCompress, {
    encodings: ['gzip', 'deflate'],
  });

  // Cookie Parser
  await app.register(fastifyCookie, {
    secret: process.env.COOKIE_SECRET || 'cookie-secret-change-in-production',
  });

  // Rate Limiting
  await app.register(fastifyRateLimit, {
    max: 100,
    timeWindow: '15 minutes',
    skipOnError: true,
    keyGenerator: (request) => {
      return (
        request.headers['x-forwarded-for']?.toString() ||
        request.ip ||
        'unknown'
      );
    },
    errorResponseBuilder: () => ({
      statusCode: 429,
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Please try again later.',
    }),
  });

  // Global Validation Pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Swagger Documentation
  if (
    process.env.NODE_ENV !== 'production' ||
    process.env.ENABLE_SWAGGER === 'true'
  ) {
    const config = new DocumentBuilder()
      .setTitle('Async Job Platform API')
      .setDescription(
        `
## Async Job Platform REST API

Bu API, asenkron iş kuyruğu yönetimi için tasarlanmıştır.

### Özellikler:
- Job oluşturma ve yönetimi
- Kuyruk durumu izleme
- Worker yönetimi
- Webhook desteği

### Rate Limiting:
- 100 istek / 15 dakika
      `,
      )
      .setVersion('1.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'Authorization',
          description: 'Enter JWT token',
          in: 'header',
        },
        'JWT-auth',
      )
      .addTag('Jobs', 'Job yönetimi işlemleri')
      .addTag('Queues', 'Kuyruk işlemleri')
      .addTag('Health', 'Sağlık kontrolleri')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        docExpansion: 'none',
        filter: true,
        showRequestDuration: true,
      },
    });

    logger.log('Swagger documentation available at /docs');
  }

  // Health Check Endpoint
  const fastifyInstance = app.getHttpAdapter().getInstance();
  fastifyInstance.get('/_health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
  }));

  // Graceful Shutdown
  app.enableShutdownHooks();

  const port = process.env.API_PORT || process.env.PORT || 3000;
  const host = '0.0.0.0';

  await app.listen(port, host);

  logger.log(`Application running on: ${await app.getUrl()}`);
  logger.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.log(`API Prefix: /api/v1`);
}

bootstrap().catch((err) => {
  console.error('Failed to start application:', err);
  process.exit(1);
});
