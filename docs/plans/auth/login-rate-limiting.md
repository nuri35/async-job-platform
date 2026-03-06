# Step 02.7: Login Rate Limiting

## Scope

Login endpoint'e multi-layer rate limiting ekle. Sliding window pattern ile. Lock tetiklendiğinde RabbitMQ üzerinden bildirim emaili gönder. Sadece bu plandaki dosyalarla çalış.

---

## Flow

```
Request geldi (email + ip)
  → IP bloklu mu? (login:block:ip:{ip}) → Evet: reject
  → Email kilitli mi? (login:lock:email:{email}) → Evet: reject
  → Normal login akışı (user bul, isActive, bcrypt)
  → Başarılı → email sliding window temizle, IP'ye dokunma
  → Başarısız → sliding window'a ekle, threshold kontrolü yap
```

---

## Sliding Window Strategy (Redis Sorted Set)

Fixed window yerine sliding window kullan. Her fail kendi timestamp'ini taşır, son 15 dakikadaki toplam sayılır.

### Neden Sliding Window?

```
Fixed window problemi:
  14:59 → 5 fail (window doldu, lock)
  15:00 → key expire, sıfırlandı
  15:01 → 5 fail daha
  = 2 dakikada 10 deneme, limit bypass edildi

Sliding window:
  14:59 → 5 fail (lock)
  15:01 → son 15dk kontrol: 14:59'daki 5 fail hâlâ pencerede
  = bypass edilemez
```

### Redis Komutları (Her fail'de)

```
ZADD login:sw:email:{email} {timestamp} {unique_id}   # fail ekle
ZREMRANGEBYSCORE login:sw:email:{email} 0 {now - 900}  # 15dk'dan eskileri sil
ZCARD login:sw:email:{email}                            # penceredeki toplam
EXPIRE login:sw:email:{email} 900                       # key TTL (güvenlik)
```

Aynı pattern IP için de geçerli: `login:sw:ip:{ip}`

---

## Redis Key Yapısı

```
login:sw:email:{email}        → Sorted Set (score=timestamp), penceredeki fail'ler
login:lock:email:{email}      → "1", TTL 15min (5 fail'de oluşur)
login:sw:ip:{ip}              → Sorted Set (score=timestamp), penceredeki fail'ler
login:block:ip:{ip}           → "1", TTL 15min (15 fail'de oluşur)
login:lock-notify:{email}     → "1", TTL 1hr (lock email cooldown)
```

---

## Threshold'lar

Email: 5 failed attempt (son 15dk) → lock 15 dakika
IP: 15 failed attempt (son 15dk) → block 15 dakika
Progressive delay (email bazlı): 3. fail → 1s, 4. fail → 2s, 5. fail → lock
Progressive delay (IP bazlı): 11. fail → 1s, 12. fail → 2s, 13. fail → 4s, 14. fail → 8s, 15. fail → block

---

## New File: Login Rate Limit Service

`modules/auth/services/login-rate-limit.service.ts`

Inject: Redis (ioredis)

### Public Methods

- `checkIpBlocked(ip: string): Promise<void>` → blocked ise UnauthorizedException fırlat
- `checkEmailLocked(email: string): Promise<void>` → locked ise UnauthorizedException fırlat
- `recordFailedAttempt(email: string, ip: string): Promise<number>` → delay ms döner (0, 1000, 2000, 4000, 8000)
- `clearEmailCounters(email: string): Promise<void>` → başarılı login'de çağır (sorted set sil)
- `shouldNotifyLock(email: string): Promise<boolean>` → cooldown key yoksa true, varsa false

### Private Methods

- `addToSlidingWindow(key: string, windowSeconds: number): Promise<number>` → ZADD + ZREMRANGEBYSCORE + ZCARD, count döner
- `lockEmail(email: string): Promise<void>` → lock key set et
- `blockIp(ip: string): Promise<void>` → block key set et
- `setNotifyCooldown(email: string): Promise<void>` → cooldown key set et
- `calculateDelay(count: number, delayStart: number): number` → progressive delay hesapla

### Constants

```typescript
const EMAIL_FAIL_THRESHOLD = 5;
const IP_FAIL_THRESHOLD = 15;
const WINDOW_SECONDS = 900;        // 15 dakika sliding window
const LOCK_TTL = 900;              // 15 dakika lock süresi
const NOTIFY_COOLDOWN_TTL = 3600;  // 1 saat email cooldown
const EMAIL_DELAY_START = 3;       // 3. fail'den itibaren delay
const IP_DELAY_START = 11;         // 11. fail'den itibaren delay
```

### addToSlidingWindow Implementasyonu

```typescript
private async addToSlidingWindow(key: string, windowSeconds: number): Promise<number> {
  const now = Date.now();
  const windowStart = now - (windowSeconds * 1000);
  const uniqueId = `${now}:${Math.random().toString(36).slice(2, 8)}`;

  const pipeline = this.redis.pipeline();
  pipeline.zremrangebyscore(key, 0, windowStart);  // eskileri sil
  pipeline.zadd(key, now, uniqueId);                // yeni fail ekle
  pipeline.zcard(key);                              // toplam say
  pipeline.expire(key, windowSeconds);              // TTL güvenlik

  const results = await pipeline.exec();
  const count = results[2][1] as number;            // zcard sonucu

  return count;
}
```

Redis pipeline kullan — 4 komut tek roundtrip'te gider. Atomic değil ama rate limiting için yeterli tutarlılık.

### calculateDelay Implementasyonu

```typescript
private calculateDelay(count: number, delayStart: number): number {
  if (count < delayStart) return 0;
  const delayIndex = count - delayStart;
  return Math.min(1000 * Math.pow(2, delayIndex), 8000); // max 8s
}
```

```
Email: count=3 → 1s, count=4 → 2s, count=5 → lock
IP:    count=11 → 1s, count=12 → 2s, count=13 → 4s, count=14 → 8s, count=15 → block
```

---

## AuthService.login() Değişikliği

```typescript
async login(dto, ipAddress, userAgent):
  // 1. Rate limit kontrolleri (mevcut logic'ten ÖNCE)
  await this.loginRateLimitService.checkIpBlocked(ipAddress)
  await this.loginRateLimitService.checkEmailLocked(dto.email)

  // 2. Normal login akışı (mevcut kod)
  // ... find user, check isActive, isEmailVerified, bcrypt compare ...

  // 3a. Başarılı login
  await this.loginRateLimitService.clearEmailCounters(dto.email)
  // ... token üret, session oluştur, return ...

  // 3b. Başarısız login (catch veya if bloğunda)
  const delayMs = await this.loginRateLimitService.recordFailedAttempt(dto.email, ipAddress)
  if (delayMs > 0) await sleep(delayMs)

  // Lock tetiklendiyse email gönder
  const shouldNotify = await this.loginRateLimitService.shouldNotifyLock(dto.email)
  if (shouldNotify) {
    this.emailQueueService.publishLockNotification(dto.email)
  }

  throw new UnauthorizedException('Invalid credentials')
```

Response her zaman aynı: "Invalid credentials" — lock/block/wrong password fark etmez.

---

## RabbitMQ Email Queue (NestJS Microservice Pattern)

### New File: Email Queue Service

`modules/auth/services/email-queue.service.ts`

```typescript
Inject: ClientProxy (RabbitMQ)

Methods:
- publishLockNotification(email: string): void
  → this.client.emit('auth.email.lock-notification', { email, timestamp })
```

fire-and-forget — await yok, login'i bloklamaz.

### auth.module.ts — RabbitMQ Client Registration

```typescript
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

> Şu an sadece publish tarafını yaz. Consumer (worker) tarafı worker planında yapılacak.
> Dev ortamında queue'ya mesaj gider ama consumer yoksa RabbitMQ'da bekler — sorun değil.

---

## Barrel Export Güncellemeleri

- `services/index.ts` → LoginRateLimitService, EmailQueueService ekle

## auth.module.ts Güncellemesi

- providers → LoginRateLimitService, EmailQueueService ekle
- imports → ClientsModule.register (RabbitMQ) ekle

---

## Doğrulama

```bash
npm run build
```

Build 0 error olmalı.

---

## Kontrol Listesi

- [ ] LoginRateLimitService oluştur (sliding window pattern)
- [ ] addToSlidingWindow — Redis pipeline ile ZADD + ZREMRANGEBYSCORE + ZCARD + EXPIRE
- [ ] checkIpBlocked, checkEmailLocked — block/lock key kontrol
- [ ] recordFailedAttempt — sliding window + progressive delay + threshold kontrolü
- [ ] calculateDelay — exponential backoff (1s, 2s, 4s, 8s)
- [ ] clearEmailCounters — sorted set sil (başarılı login)
- [ ] shouldNotifyLock + setNotifyCooldown — email spam önleme
- [ ] EmailQueueService oluştur (RabbitMQ publisher, fire-and-forget)
- [ ] AuthService.login() → rate limit kontrolleri ekle
- [ ] AuthService.login() → başarısız login'de recordFailedAttempt + delay
- [ ] AuthService.login() → lock notify kontrolü
- [ ] auth.module.ts → providers ve imports güncelle
- [ ] Barrel export'ları güncelle
- [ ] npm run build — 0 error

## Do NOT Touch

- Register flow + register rate limit guard
- Refresh/logout/session endpoints
- Token service
- Jobs module
- Worker app
- Mevcut SessionService rate limit logic'i (genel amaçlı, kalacak)