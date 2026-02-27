# Step 02.7: Login Rate Limiting

## Scope

Login endpoint'e multi-layer rate limiting ekle. Lock tetiklendiğinde RabbitMQ üzerinden bildirim emaili gönder. Sadece bu plandaki dosyalarla çalış.

## Flow

```
Request geldi (email + ip)
  → IP bloklu mu? (login:block:ip:{ip}) → Evet: reject
  → Email kilitli mi? (login:lock:email:{email}) → Evet: reject
  → Normal login akışı (user bul, isActive, bcrypt)
  → Başarılı → email counter/lock sil, IP'ye dokunma
  → Başarısız → counter'ları artır, threshold kontrolü yap
```

## Redis Key Yapısı

```
login:fail:email:{email}      → counter, TTL 15min
login:lock:email:{email}      → "1", TTL 15min (5 fail'de oluşur)
login:fail:ip:{ip}            → counter, TTL 15min
login:block:ip:{ip}           → "1", TTL 15min (15 fail'de oluşur)
login:lock-notify:{email}     → "1", TTL 1hr (lock email cooldown)
```

## Threshold'lar

Email: 5 failed attempt → lock 15 dakika
IP: 15 failed attempt → block 15 dakika
Progressive delay (email bazlı): 3. fail → 1s, 4. fail → 2s, 5. fail → lock
Progressive delay (IP bazlı): 11. fail → 1s, 12. fail → 2s, 13. fail → 4s, 14. fail → 8s, 15. fail → block

## New File: Login Rate Limit Service

`modules/auth/services/login-rate-limit.service.ts`

Inject: Redis (ioredis)

Methods:
- `checkIpBlocked(ip: string): Promise<void>` → blocked ise UnauthorizedException
- `checkEmailLocked(email: string): Promise<void>` → locked ise UnauthorizedException
- `recordFailedAttempt(email: string, ip: string): Promise<number>` → delay ms döner (0, 1000, 2000, 4000, 8000)
- `clearEmailCounters(email: string): Promise<void>` → başarılı login'de çağır
- `shouldNotifyLock(email: string): Promise<boolean>` → cooldown key yoksa true, varsa false

Private:
- `incrementEmailFail(email: string): Promise<number>`
- `incrementIpFail(ip: string): Promise<number>`
- `lockEmail(email: string): Promise<void>`
- `blockIp(ip: string): Promise<void>`
- `setNotifyCooldown(email: string): Promise<void>`

Constants (class üstünde veya ayrı constants dosyasında):
- EMAIL_FAIL_THRESHOLD = 5
- IP_FAIL_THRESHOLD = 15
- LOCK_TTL = 900 (15 min)
- NOTIFY_COOLDOWN_TTL = 3600 (1 hr)
- EMAIL_DELAY_START = 3 (3. fail'den itibaren delay)
- IP_DELAY_START = 11

## AuthService.login() Değişikliği

```
async login(dto, ipAddress, userAgent):
  // 1. Rate limit kontrolleri (mevcut logic'ten ÖNCE)
  await this.loginRateLimitService.checkIpBlocked(ipAddress)
  await this.loginRateLimitService.checkEmailLocked(dto.email)

  // 2. Normal login akışı (mevcut kod)
  // ... find user, check isActive, bcrypt compare ...

  // 3a. Başarılı login
  await this.loginRateLimitService.clearEmailCounters(dto.email)
  // ... token üret, session oluştur, return ...

  // 3b. Başarısız login (catch veya if bloğunda)
  const delayMs = await this.loginRateLimitService.recordFailedAttempt(dto.email, ipAddress)
  if (delayMs > 0) await sleep(delayMs)

  // Lock tetiklendiyse email gönder
  const shouldNotify = await this.loginRateLimitService.shouldNotifyLock(dto.email)
  if (shouldNotify) {
    await this.emailQueueService.publishLockNotification(dto.email)
    // cooldown set edilir shouldNotifyLock içinde veya burada
  }

  throw UnauthorizedException('Invalid credentials')
```

Response her zaman aynı: "Invalid credentials" — lock/block/wrong password fark etmez.

## RabbitMQ Email Queue (NestJS Microservice Pattern)

### New File: Email Queue Service
`modules/auth/services/email-queue.service.ts`

```
Inject: ClientProxy (RabbitMQ)

Methods:
- publishLockNotification(email: string): Promise<void>
  → this.client.emit('auth.email.lock-notification', { email, timestamp })
```

### auth.module.ts — RabbitMQ Client Registration

```
ClientsModule.register([{
  name: 'EMAIL_SERVICE',
  transport: Transport.RMQ,
  options: {
    urls: [configService.get('RABBITMQ_URL')],
    queue: 'email_queue',
    queueOptions: { durable: true },
  },
}])
```

### Worker Tarafı (TODO — Worker planında implement edilecek)

Worker'da `email_queue` consumer'ı dinleyecek:
- Pattern: 'auth.email.lock-notification'
- Handler: email'i al, nodemailer ile gönder
- TODO: nodemailer setup, email template, SMTP config
- TODO: Worker planına `EMAIL` job type olarak ekle

> Şu an sadece publish tarafını yaz. Consumer (worker) tarafı worker planında yapılacak.
> Dev ortamında queue'ya mesaj gider ama consumer yoksa RabbitMQ'da bekler — sorun değil.

## Barrel Export Güncellemeleri

- `services/index.ts` → LoginRateLimitService, EmailQueueService ekle

## auth.module.ts Güncellemesi

- providers → LoginRateLimitService, EmailQueueService ekle
- imports → ClientsModule.register (RabbitMQ) ekle

## Validation

```bash
npm run build
```

Build 0 error olmalı.

## Do NOT Touch

- Register flow
- Refresh/logout/session endpoints
- Token service
- Jobs module
- Worker app
- Mevcut SessionService rate limit logic'i (genel amaçlı, kalacak)