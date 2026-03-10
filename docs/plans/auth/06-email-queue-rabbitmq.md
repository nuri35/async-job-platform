# 06 — Email Queue: RabbitMQ Hybrid Application Pattern

## Amaç

Login rate limiting'de tetiklenen email lock notification'ını RabbitMQ üzerinden asenkron göndermek. **Hybrid Application Pattern** — API aynı process içinde hem HTTP hem RabbitMQ consumer dinler. Ayrı worker gerekmez.

Ayrıca RabbitMQ bağlantı config'ini **merkezi bir module** haline getirip auth module'dan ayırmak. İleride jobs module da aynı altyapıyı kullanacak.

**Dead Letter Queue (DLQ)** ile fail olan mesajların sonsuz retry döngüsüne girmesi engellenir. 3 deneme sonra mesaj `email_queue_dlq`'ya taşınır.

**Topic Exchange** ile publisher'lar queue adını bilmeden routing key ile mesaj gönderir. Exchange routing key pattern'ine göre doğru queue'ya yönlendirir. Yeni email type'ları eklendiğinde sıfır config değişikliği yeterli olur.

---

## Mevcut Durum

- `auth.module.ts` → `ClientsModule.registerAsync` ile RabbitMQ connection doğrudan auth içinde (kötü — auth, RabbitMQ connection bilgisini bilmemeli)
- `EmailQueueService` → `client.emit()` ile mesaj gönderiyor (producer çalışıyor)
- **Consumer yok** — mesajlar `email_queue`'da birikip duruyor, kimse okumuyor
- `EmailService` → auth module içinde, sadece SMTP sender
- **Default exchange** kullanılıyor — publisher queue adını biliyor, bağımlılık var

---

## Mimari Kararlar

### RabbitMQ Module → `libs/common`

Connection config tek yerde. Herhangi bir module `import` ederek publisher olabilir.

### Topic Exchange

```
app_exchange (type: topic)
  │
  │  Binding: email.# → email_queue
  │
  ├─ routing key: email.lock         → email_queue ✓
  ├─ routing key: email.welcome      → email_queue ✓
  ├─ routing key: email.verify       → email_queue ✓
  ├─ routing key: email.reset        → email_queue ✓
  │
  │  Binding: job.# → job_queue (ileride)
  │
  ├─ routing key: job.csv-import     → job_queue ✓
  └─ routing key: job.report         → job_queue ✓
```

**Neden topic exchange?**

1. **Publisher queue adını bilmez** — sadece routing key gönderir (`email.lock`). Nereye gideceğine exchange karar verir.
2. **Yeni email type = sıfır config** — `email.reset` routing key'i `email.#` binding'ine otomatik match eder.
3. **Queue split kolaylığı** — ileride `email.critical.#` → priority queue istersen sadece binding eklersin, kod değişmez.
4. **Cross-module email** — jobs module `email.job-completed` diye publish ederse aynı `email.#` binding yakalar.
5. **Monitoring** — RabbitMQ Management UI'da tüm routing'i tek exchange'ten görürsün.

### EmailService → `libs/common`

Hem API (verification email) hem consumer (lock notification) aynı SMTP sender'ı kullanacak. Duplicate kod olmasın.

### Consumer → Embedded (Hybrid Application)

Email notification hafif iş — ayrı worker gereksiz. API process'i içinde `app.connectMicroservice()` ile RabbitMQ listener eklenir.

### EmailQueueService → Merkezi publish class

Auth module'a bağlı değil. Queue'ya mesaj göndermek isteyen herhangi bir module kullanabilir. Farklı event type'lar için method'lar sunar.

### DLQ + Delayed Retry

3 retry (2s, 5s, 15s artan delay) sonra fail olan mesajlar `email_queue_dlq`'ya taşınır. Sonsuz retry döngüsü engellenir.

---

## Dosya Yapısı (Sonuç Hali)

```
libs/common/src/
├── rabbitmq/
│   ├── rabbitmq.module.ts        # Dynamic module (forRoot + forFeature)
│   ├── rabbitmq.constants.ts     # Exchange, queue, routing key, tokens
│   └── index.ts
├── services/
│   ├── email.service.ts          # SMTP sender (auth'tan taşınacak)
│   └── index.ts
└── index.ts                      # barrel export güncelle

apps/async-job-platform/src/
├── main.ts                        # connectMicroservice ekle
├── app.module.ts                  # RabbitmqModule.forRoot import
└── modules/
    ├── auth/
    │   ├── services/
    │   │   ├── email-queue.service.ts  # publisher (routing key ile)
    │   │   └── ...
    │   └── auth.module.ts             # ClientsModule KALDIRILIR
    └── email-consumer/                # YENİ — embedded consumer
        ├── email-consumer.module.ts
        ├── email-consumer.controller.ts
        └── index.ts
```

---

## Implementasyon Adımları

### Step 1 — `libs/common/rabbitmq/` Oluştur

#### `rabbitmq.constants.ts`

```typescript
// ── Exchange ──
export const RMQ_EXCHANGE = {
  NAME: 'app_exchange',
  TYPE: 'topic',
} as const;

// ── Queue Names ──
export const QUEUE_NAMES = {
  EMAIL: 'email_queue',
  EMAIL_DLQ: 'email_queue_dlq',
  // JOB: 'job_queue',  → ileride eklenecek
} as const;

// ── Routing Keys ──
// Publisher'lar bu key'leri kullanarak mesaj gönderir.
// Exchange, key pattern'ine göre doğru queue'ya yönlendirir.
export const ROUTING_KEYS = {
  // Email routing keys
  EMAIL_LOCK: 'email.lock',
  EMAIL_WELCOME: 'email.welcome', // ileride
  EMAIL_VERIFY: 'email.verify', // ileride
  EMAIL_RESET: 'email.reset', // ileride

  // Binding patterns (consumer tarafında kullanılır)
  EMAIL_ALL: 'email.#', // tüm email.* mesajlarını yakalar
  // JOB_ALL: 'job.#',                      // ileride
} as const;

// ── Injection Tokens ──
export const RMQ_TOKENS = {
  EMAIL: 'RMQ_EMAIL_CLIENT',
} as const;

// ── Retry Config ──
export const RMQ_MAX_RETRIES = 3;
export const RMQ_RETRY_DELAYS = [2000, 5000, 15000]; // ms — artan bekleme
```

#### `rabbitmq.module.ts`

```typescript
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
    const user = configService.get('RABBITMQ_USER', 'guest');
    const pass = configService.get('RABBITMQ_PASSWORD', 'guest');
    const host = configService.get('RABBITMQ_HOST', 'localhost');
    const port = configService.get('RABBITMQ_PORT', 5672);
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
   * Kullanım: RabbitmqModule.forFeature(RMQ_TOKENS.EMAIL, QUEUE_NAMES.EMAIL)
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
                queueOptions: { durable: true },
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
```

**Not**: `buildUrl` static helper'ı connection string'ini tek yerden yönetir. `main.ts`, `forRoot`, `forFeature` hepsi bunu kullanır.

#### `index.ts`

```typescript
export * from './rabbitmq.module';
export * from './rabbitmq.constants';
```

---

### Step 2 — `EmailService` → `libs/common/services/` Taşı

#### Taşınacak dosya

`apps/async-job-platform/src/modules/auth/services/email.service.ts`
→ `libs/common/src/services/email.service.ts`

İçerik aynı kalır. Sadece path değişir.

#### `libs/common/src/services/index.ts`

```typescript
export * from './email.service';
```

#### `libs/common/src/index.ts` güncelle

```typescript
export * from './entities';
export * from './enums';
export * from './interfaces';
export * from './repositories';
export * from './rabbitmq'; // YENİ
export * from './services'; // YENİ
```

---

### Step 3 — `EmailQueueService` Refactor (Merkezi Publisher + Routing Key)

Mevcut `EmailQueueService` auth'a bağlı ve default exchange kullanıyor. Topic exchange + routing key'e çeviriyoruz:

#### `apps/.../auth/services/email-queue.service.ts` (güncelle)

```typescript
import { Injectable, Inject, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { RMQ_TOKENS, ROUTING_KEYS } from '@app/common';

@Injectable()
export class EmailQueueService {
  private readonly logger = new Logger(EmailQueueService.name);

  constructor(
    @Inject(RMQ_TOKENS.EMAIL)
    private readonly client: ClientProxy,
  ) {}

  /**
   * Account lock notification — routing key: email.lock
   * Topic exchange üzerinden email_queue'ya yönlenir (email.# binding)
   */
  publishLockNotification(email: string): void {
    this.client.emit(ROUTING_KEYS.EMAIL_LOCK, {
      email,
      timestamp: new Date().toISOString(),
    });
    this.logger.debug(`Lock notification queued for: ${email}`);
  }

  // İleride eklenecek — aynı pattern, farklı routing key:
  //
  // publishWelcomeEmail(email: string): void {
  //   this.client.emit(ROUTING_KEYS.EMAIL_WELCOME, { email });
  // }
  //
  // publishPasswordResetEmail(email: string, token: string): void {
  //   this.client.emit(ROUTING_KEYS.EMAIL_RESET, { email, token });
  // }
  //
  // publishVerificationEmail(email: string, link: string): void {
  //   this.client.emit(ROUTING_KEYS.EMAIL_VERIFY, { email, link });
  // }
}
```

**Önemli değişiklik**: `'auth.email.lock-notification'` string yerine `ROUTING_KEYS.EMAIL_LOCK` (`'email.lock'`) kullanılıyor. Bu routing key, exchange'in `email.#` binding'ine match eder ve `email_queue`'ya yönlenir.

**Not**: `EmailQueueService` auth module'da kalıyor. Çünkü auth-specific event'leri publish ediyor. Ama RabbitMQ connection bilgisi artık `RabbitmqModule`'den geliyor — auth bu detayı bilmiyor.

---

### Step 4 — `auth.module.ts` Refactor

```typescript
// SİLİNECEK:
import { ClientsModule, Transport } from '@nestjs/microservices';

// SİLİNECEK: tüm ClientsModule.registerAsync([...]) bloğu

// EKLENECEK:
import { RabbitmqModule, RMQ_TOKENS, QUEUE_NAMES } from '@app/common';

@Module({
  imports: [
    // ... mevcut import'lar (TypeORM, Passport, JWT, Redis)

    // YENİ — sadece bu satır
    RabbitmqModule.forFeature(RMQ_TOKENS.EMAIL, QUEUE_NAMES.EMAIL),
  ],
  // ...
})
```

Ayrıca `EmailService` import path'i güncellenir:

```typescript
// ESKİ:
import { EmailService } from './services/email.service';

// YENİ:
import { EmailService } from '@app/common';
```

`services/index.ts`'den `email.service` export'u kaldırılır. Auth module providers'da `EmailService` kalır (DI için lazım).

---

### Step 5 — `app.module.ts` Güncelle

```typescript
import { RabbitmqModule } from '@app/common';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    TypeOrmModule.forRootAsync({ useClass: DatabaseConfig }),
    RabbitmqModule.forRoot(), // YENİ — merkezi RMQ config
    AuthModule,
    JobsModule,
    EmailConsumerModule, // YENİ — embedded consumer
  ],
  // ...
})
export class AppModule {}
```

---

### Step 6 — `main.ts` Hybrid Application + Topic Exchange Setup

```typescript
import { Transport, MicroserviceOptions } from '@nestjs/microservices';
import {
  QUEUE_NAMES,
  ROUTING_KEYS,
  RMQ_EXCHANGE,
  RabbitmqModule,
} from '@app/common';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ ... }),
  );

  // ... mevcut HTTP setup (helmet, cors, swagger vs.)

  // Embedded RabbitMQ Consumer — Hybrid Application Pattern
  const configService = app.get(ConfigService);
  const rmqUrl = RabbitmqModule.buildUrl(configService);

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [rmqUrl],
      queue: QUEUE_NAMES.EMAIL,
      queueOptions: {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': '',
          'x-dead-letter-routing-key': QUEUE_NAMES.EMAIL_DLQ,
        },
      },
      // Topic exchange — email.# pattern'i ile bind
      exchange: RMQ_EXCHANGE.NAME,
      exchangeType: RMQ_EXCHANGE.TYPE,
      routingKey: ROUTING_KEYS.EMAIL_ALL,  // 'email.#'
      noAck: false,
      prefetchCount: 1,
    },
  });

  await app.startAllMicroservices(); // RabbitMQ dinlemeye başla
  await app.listen(port, host);     // HTTP dinlemeye başla
}
```

**Burada ne oluyor?**

1. `exchange: 'app_exchange'` → topic exchange declare edilir (yoksa oluşturulur)
2. `routingKey: 'email.#'` → `email_queue` bu exchange'e `email.#` pattern'i ile bind olur
3. `email.lock`, `email.welcome`, `email.reset` → hepsi bu binding'e match eder → `email_queue`'ya düşer
4. DLQ arguments → 3x fail olan mesajlar `email_queue_dlq`'ya yönlenir

---

### Step 7 — Email Consumer Module (Embedded)

#### `modules/email-consumer/email-consumer.controller.ts`

```typescript
import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload, Ctx, RmqContext } from '@nestjs/microservices';
import {
  EmailService,
  ROUTING_KEYS,
  RMQ_MAX_RETRIES,
  RMQ_RETRY_DELAYS,
} from '@app/common';

@Controller()
export class EmailConsumerController {
  private readonly logger = new Logger(EmailConsumerController.name);

  constructor(private readonly emailService: EmailService) {}

  @EventPattern(ROUTING_KEYS.EMAIL_LOCK)
  async handleLockNotification(
    @Payload() data: { email: string; timestamp: string },
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const message = context.getMessage();

    // Retry count — RabbitMQ her nack+requeue'da x-death header'ına yazar
    const deaths = message.properties?.headers?.['x-death'];
    const retryCount = deaths?.[0]?.count ?? 0;

    try {
      await this.emailService.sendMail(
        data.email,
        'Account Locked - Security Alert',
        `<p>Your account has been temporarily locked due to multiple failed login attempts.</p>
         <p>If this wasn't you, please reset your password immediately.</p>
         <p>The lock will automatically expire in 15 minutes.</p>`,
      );

      this.logger.log(`Lock notification sent to: ${data.email}`);
      channel.ack(message);
    } catch (error) {
      if (retryCount + 1 >= RMQ_MAX_RETRIES) {
        this.logger.error(
          `Max retries reached for ${data.email}, sending to DLQ`,
        );
        channel.nack(message, false, false);
        return;
      }

      // Delayed retry — bekle, sonra requeue
      const delay = RMQ_RETRY_DELAYS[retryCount] ?? RMQ_RETRY_DELAYS.at(-1);
      this.logger.warn(
        `Retry ${retryCount + 1}/${RMQ_MAX_RETRIES} for ${data.email}, waiting ${delay}ms`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
      channel.nack(message, false, true);
    }
  }

  // ── İleride eklenecek consumer'lar ──
  //
  // @EventPattern(ROUTING_KEYS.EMAIL_WELCOME)
  // async handleWelcomeEmail(@Payload() data, @Ctx() ctx: RmqContext) {
  //   // Hoşgeldin email'i gönder
  // }
  //
  // @EventPattern(ROUTING_KEYS.EMAIL_RESET)
  // async handlePasswordReset(@Payload() data, @Ctx() ctx: RmqContext) {
  //   // Şifre sıfırlama email'i gönder
  // }
  //
  // @EventPattern(ROUTING_KEYS.EMAIL_VERIFY)
  // async handleVerification(@Payload() data, @Ctx() ctx: RmqContext) {
  //   // Email doğrulama email'i gönder
  // }
}
```

**`@EventPattern(ROUTING_KEYS.EMAIL_LOCK)`** → `'email.lock'` routing key'ine sahip mesajları yakalar. İleride `EMAIL_WELCOME`, `EMAIL_RESET` gibi yeni pattern'ler eklendiğinde sadece yeni bir method + `@EventPattern` eklemek yeterli.

#### `modules/email-consumer/email-consumer.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { EmailService } from '@app/common';
import { EmailConsumerController } from './email-consumer.controller';

@Module({
  controllers: [EmailConsumerController],
  providers: [EmailService],
})
export class EmailConsumerModule {}
```

#### `modules/email-consumer/index.ts`

```typescript
export * from './email-consumer.module';
```

---

### Step 8 — Auth Module Temizlik

`auth/services/` içinden `email.service.ts` silinir (libs/common'a taşındı).

`auth/services/index.ts` güncellenir:

```typescript
export * from './session.service';
export * from './token.service';
export * from './auth.service';
// email.service KALDIRILDI — artık @app/common'dan
export * from './login-rate-limit.service';
export * from './email-queue.service';
```

`auth.service.ts` içindeki `EmailService` import'u güncellenir:

```typescript
// ESKİ:
import { EmailService } from './email.service';

// YENİ:
import { EmailService } from '@app/common';
```

---

### Step 9 — `modules/index.ts` Güncelle

```typescript
export * from './auth';
export * from './jobs';
export * from './email-consumer'; // YENİ
```

---

### Step 10 — Build & Doğrulama

```bash
npm run build
```

- TypeScript derleme hatası olmamalı
- API başlatıldığında log'da hem HTTP hem RabbitMQ connection görülmeli
- RabbitMQ Management UI'da `app_exchange` (topic) oluşmuş olmalı
- `email_queue` → `app_exchange`'e `email.#` ile bind olmuş olmalı
- `EmailQueueService.publishLockNotification()` → routing key `email.lock` ile publish
- `EmailConsumerController` → `email.lock` pattern'i ile mesajı alıp mail göndermeli

---

## Topic Exchange Akış Diyagramı

```
┌─────────────────────────────────────────────────────────────────┐
│                        app_exchange (topic)                      │
│                                                                  │
│  Bindings:                                                       │
│    email.# ──── → email_queue                                    │
│    job.#   ──── → job_queue (ileride)                            │
│                                                                  │
│  Routing:                                                        │
│    email.lock      → match email.# → email_queue ✓              │
│    email.welcome   → match email.# → email_queue ✓              │
│    email.reset     → match email.# → email_queue ✓              │
│    email.verify    → match email.# → email_queue ✓              │
│    job.csv-import  → match job.#   → job_queue ✓ (ileride)      │
└─────────────────────────────────────────────────────────────────┘
```

## Mesaj Akışı (Son Hali)

```
Login 5x fail
  │
  ├─ LoginRateLimitService.recordFailedAttempt()
  │    └─ Lua script → lock + count (atomic)
  │
  ├─ LoginRateLimitService.shouldNotifyLock()
  │    └─ SET NX EX → true (atomic)
  │
  ├─ EmailQueueService.publishLockNotification(email)
  │    └─ client.emit(ROUTING_KEYS.EMAIL_LOCK, { email })
  │         └─ routing key: 'email.lock'
  │              └─ → app_exchange (topic)
  │                   └─ match: email.# → email_queue
  │
  └─ [Aynı process, embedded consumer]
       @EventPattern(ROUTING_KEYS.EMAIL_LOCK)
       EmailConsumerController.handleLockNotification()
         │
         ├─ Başarılı → EmailService.sendMail() → channel.ack() ✓
         │
         └─ Fail →
              ├─ retry 1 → 2s bekle  → nack(requeue: true) → email_queue'ya geri
              ├─ retry 2 → 5s bekle  → nack(requeue: true) → email_queue'ya geri
              └─ retry 3 → nack(requeue: false) → email_queue_dlq'ya
```

### DLQ Flow

```
email_queue                          email_queue_dlq
┌──────────────┐    nack(false)     ┌──────────────────┐
│ mesaj geldi   │──── 3x fail ─────►│ mesaj burada kalır│
│ consume et    │                   │ manual inceleme   │
│ retry dene    │                   │ veya monitoring   │
└──────────────┘                    └──────────────────┘
```

---

## İleride Yeni Email Type Eklemek (Örnek: Welcome Email)

Topic exchange sayesinde yeni email type eklemek çok kolay:

### 1. Constants'a routing key zaten var

```typescript
// rabbitmq.constants.ts — zaten tanımlı
EMAIL_WELCOME: 'email.welcome',
```

### 2. Publisher'a method ekle

```typescript
// email-queue.service.ts
publishWelcomeEmail(email: string, name: string): void {
  this.client.emit(ROUTING_KEYS.EMAIL_WELCOME, { email, name });
}
```

### 3. Consumer'a handler ekle

```typescript
// email-consumer.controller.ts
@EventPattern(ROUTING_KEYS.EMAIL_WELCOME)
async handleWelcomeEmail(@Payload() data, @Ctx() ctx: RmqContext) {
  // ...
}
```

**Exchange config'e dokunma yok. Queue config'e dokunma yok. Binding değişmez.**
`email.welcome` routing key'i `email.#` binding'ine otomatik match eder.

---

## İleride Queue Split Etmek (Örnek: Priority Emails)

Critical email'ler (lock, reset) hızlı gitsin, normal email'ler (welcome) bekleyebilsin:

### Sadece yeni binding + queue ekle

```
app_exchange (topic)
  email.lock    → match email.critical.# ? HAYIR → match email.# → email_queue
```

Aslında routing key'leri yeniden düzenlemek gerekir:

```typescript
// constants güncellenir:
EMAIL_LOCK: 'email.critical.lock',
EMAIL_RESET: 'email.critical.reset',
EMAIL_WELCOME: 'email.normal.welcome',
EMAIL_VERIFY: 'email.normal.verify',
```

```
app_exchange (topic)
  email.critical.# → email_priority_queue (yeni)
  email.normal.#   → email_queue
  email.#          → email_queue (fallback — hepsini yakalar)
```

**Publisher kodu değişmez** — sadece constants değerleri güncellenir. Exchange binding'leri queue seviyesinde ayarlanır.

---

## Dokunulmayacaklar

- `LoginRateLimitService` — değişmez
- `AuthService.handleFailedLogin` — değişmez (sadece EmailService import path güncellenir)
- `TokenService`, `SessionService` — değişmez
- Worker app (`apps/worker/`) — bu plana dahil değil, jobs için ileride ayrı plan

---

## Kontrol Listesi

- [ ] `libs/common/src/rabbitmq/rabbitmq.constants.ts` oluştur (EXCHANGE, QUEUE_NAMES, ROUTING_KEYS, TOKENS, RETRY)
- [ ] `libs/common/src/rabbitmq/rabbitmq.module.ts` oluştur (forRoot + forFeature + buildUrl)
- [ ] `libs/common/src/rabbitmq/index.ts` oluştur
- [ ] `EmailService` → `libs/common/src/services/email.service.ts` taşı
- [ ] `libs/common/src/services/index.ts` oluştur
- [ ] `libs/common/src/index.ts` güncelle (rabbitmq + services export)
- [ ] `EmailQueueService` → token `RMQ_TOKENS.EMAIL`, routing key `ROUTING_KEYS.EMAIL_LOCK`
- [ ] `auth.module.ts` → `ClientsModule` bloğu SİL, `RabbitmqModule.forFeature` import et
- [ ] `auth.module.ts` → `EmailService` import'unu `@app/common`'a çevir
- [ ] `auth.service.ts` → `EmailService` import'unu `@app/common`'a çevir
- [ ] `auth/services/email.service.ts` SİL
- [ ] `auth/services/index.ts` güncelle
- [ ] `app.module.ts` → `RabbitmqModule.forRoot()` + `EmailConsumerModule` import
- [ ] `main.ts` → `connectMicroservice()` with topic exchange + DLQ arguments
- [ ] `main.ts` → `startAllMicroservices()` ekle
- [ ] `modules/email-consumer/` oluştur (module + controller + index)
- [ ] `email-consumer.controller.ts` → `@EventPattern(ROUTING_KEYS.EMAIL_LOCK)` + retry + DLQ
- [ ] `modules/index.ts` güncelle
- [ ] `npm run build` — başarılı
- [ ] RabbitMQ Management UI'da `app_exchange` ve binding'leri doğrula



