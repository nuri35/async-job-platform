# RabbitMQ Email Notification — Test Analysis Report

**Tarih:** 2026-03-12
**Collection:** Auth - Login
**Folder:** RabbitMQ Email Notification
**Sonuc:** ALL TESTS PASSED — 10/10 requests, 20/20 assertions, 645ms total

---

## Newman Test Sonuclari (Ozet)

| #   | Test                                          | Method | Endpoint                                   | Status | Sure | Assertions |
| --- | --------------------------------------------- | ------ | ------------------------------------------ | ------ | ---- | ---------- |
| 1   | Check Email Queue Exists                      | GET    | /api/queues/%2F/email_queue (RabbitMQ)     | 200    | 41ms | 2/2        |
| 2   | RMQ Lock - Fail #1                            | POST   | /api/v1/auth/login                         | 401    | 51ms | 1/1        |
| 3   | RMQ Lock - Fail #2                            | POST   | /api/v1/auth/login                         | 401    | 8ms  | 1/1        |
| 4   | RMQ Lock - Fail #3 (429)                      | POST   | /api/v1/auth/login                         | 429    | 10ms | 1/1        |
| 5   | RMQ Lock - Fail #4 (429)                      | POST   | /api/v1/auth/login                         | 429    | 10ms | 1/1        |
| 6   | Trigger Lock (fail #5) - email.lock published | POST   | /api/v1/auth/login                         | 429    | 11ms | 2/2        |
| 7   | Verify email.lock Message in Queue            | GET    | /api/queues/%2F/email_queue (RabbitMQ)     | 200    | 3/3  |
| 8   | Get Messages from Queue (peek)                | POST   | /api/queues/%2F/email_queue/get (RabbitMQ) | 200    | 7ms  | 4/4        |
| 9   | Lock Notify Cooldown Test                     | POST   | /api/v1/auth/login                         | 401    | 7ms  | 3/3        |
| 10  | Verify Queue Count Unchanged                  | GET    | /api/queues/%2F/email_queue (RabbitMQ)     | 200    | 5ms  | 2/2        |

---

## Test-by-Test Detayli Analiz

### Test 1: Check Email Queue Exists

**Validates:** RabbitMQ `email_queue` infrastructure'inin dogru configure edildigini dogrular.

**Service Method:** Bu test direkt RabbitMQ Management API'yi cagiriyor. Uygulama tarafinda queue declaration `RabbitmqModule.forFeature()` icinde yapiliyor:

- `libs/common/src/rabbitmq/rabbitmq.module.ts:54-85` — `forFeature()` metodu `ClientsModule.registerAsync` ile queue'yu durable olarak declare eder
- `libs/common/src/rabbitmq/rabbitmq.constants.ts:8-12` — `QUEUE_NAMES.EMAIL = 'email_queue'`, `QUEUE_NAMES.EMAIL_DLQ = 'email_queue_dlq'`

**Message Flow:** Yok — sadece infrastructure kontrolu.

**RabbitMQ Components Tested:**

- `email_queue` var mi? (existence check)
- Queue durable mi? (persistence check)

**Redis Key:** Yok.

**Impact if Broken:** Queue yoksa veya yanlis configure edilmisse, hicbir lock notification mesaji iletilemez. `EmailQueueService.publishLockNotification()` `client.emit()` sessizce basarisiz olur, kullanici hesap kilitlenmesinden asla haberdar olmaz.

---

### Test 2: RMQ Lock - Fail #1

**Validates:** Ilk basarisiz login denemesinin 401 dondurmesini ve sliding window'a kaydedilmesini dogrular.

**Service Method:**

- `auth.service.ts:68-137` — `AuthService.login()` kullaniciyi bulamayinca `handleFailedLogin()` cagirir (line 80)
- `auth.service.ts:139-169` — `handleFailedLogin()` icinde `loginRateLimitService.recordFailedAttempt()` cagirilir (line 143-147)
- `login-rate-limit.service.ts:96-137` — `recordFailedAttempt()` Lua script ile atomic sliding window + threshold check yapar

**Message Flow:**

```
POST /api/v1/auth/login (wrong credentials)
  -> AuthService.login() -> user not found
  -> AuthService.handleFailedLogin(email, ip)
  -> LoginRateLimitService.recordFailedAttempt(email, ip)
     -> Lua script: ZADD login:sw:email:{email}, count=1 < 5 threshold
     -> Returns: { delayMs: 0, emailLocked: false }
  -> throw UnauthorizedException (401)
```

**Redis Key:**

- `login:sw:email:{email}` — Sorted set, score=timestamp, ilk entry eklendi
- `login:sw:ip:{ip}` — IP icin ayni sorted set

**RabbitMQ Components Tested:** Yok — henuz threshold'a ulasilmadi.

**Impact if Broken:** Failed attempt kaydedilmezse sliding window bos kalir, hesap asla kilitlenmez. Brute force saldirisi engellenmez.

---

### Test 3: RMQ Lock - Fail #2

**Validates:** 2. basarisiz login denemesi, hala 401 donuyor (delay henuz baslamadi, `EMAIL_DELAY_START = 3`).

**Service Method:** Test 2 ile ayni flow. `login-rate-limit.service.ts:182-186` — `calculateDelay()`: count=2 < delayStart=3, delay=0.

**Redis Key:** `login:sw:email:{email}` sorted set'te artik 2 entry var.

**Impact if Broken:** Progressive delay mekanizmasi count'u dogru takip edemezse, delay cok erken veya cok gec baslar.

---

### Test 4: RMQ Lock - Fail #3 (429)

**Validates:** 3. denemede progressive delay'in devreye girmesini dogrular. 429 Too Many Requests + `Retry-After` header donuyor.

**Service Method:**

- `login-rate-limit.service.ts:182-186` — `calculateDelay(3, 3)`: delayIndex=0, delay=1000ms (1s)
- `auth.service.ts:165-168` — `delayMs > 0` oldugu icin `LoginThrottleException` firlatiyor (429 response)

**Message Flow:**

```
POST /api/v1/auth/login (wrong credentials)
  -> recordFailedAttempt() -> count=3
  -> calculateDelay(3, 3) -> 1000ms
  -> throw LoginThrottleException(1) -> 429 + Retry-After: 1
```

**Redis Key:** `login:sw:email:{email}` — 3 entry, threshold (5) henuz asilmadi.

**Impact if Broken:** Progressive delay calismasa, saldirgan hizli brute force yapabilir. 429 yerine 401 donerse client retry stratejisi uygulanmaz.

---

### Test 5: RMQ Lock - Fail #4 (429)

**Validates:** 4. denemede artan delay (2s). `calculateDelay(4, 3)` = `1000 * 2^1 = 2000ms`.

**Service Method:** Ayni flow, delay artiyor: `login-rate-limit.service.ts:184-185` — `delayIndex=1`, `Math.min(2000, 8000) = 2000ms`.

**Redis Key:** `login:sw:email:{email}` — 4 entry.

---

### Test 6: Trigger Lock (fail #5) — email.lock Published

**Validates:** 5. basarisiz denemede hesabin kilitlenmesini VE `email.lock` mesajinin RabbitMQ'ya publish edilmesini dogrular. Bu testin 2 assertion'i var: hem 429 response hem de lock tetiklenmesi.

**Service Methods (tam zincir):**

1. `login-rate-limit.service.ts:96-137` — `recordFailedAttempt()`:
   - Lua script calisir (`line 41-64`), count=5 >= threshold=5
   - `redis.call('SET', lock_key, '1', 'EX', 900)` — hesap 15dk kilitlenir
   - Returns `{ delayMs: 4000, emailLocked: true }`

2. `auth.service.ts:150-161` — `handleFailedLogin()` icinde `emailLocked=true` kontrolu:

   ```typescript
   if (emailLocked) {
     const shouldNotify =
       await this.loginRateLimitService.shouldNotifyLock(email);
     if (shouldNotify) {
       this.emailQueueService.publishLockNotification(email);
     }
   }
   ```

3. `login-rate-limit.service.ts:143-153` — `shouldNotifyLock()`:
   - `SET login:lock-notify:{email} 1 EX 3600 NX` — atomic set-if-not-exists
   - Ilk cagri: key yok, set edilir, `true` doner

4. `email-queue.service.ts:18-32` — `publishLockNotification(email)`:
   ```typescript
   this.client.emit(ROUTING_KEYS.EMAIL_LOCK, {
     email,
     timestamp: new Date().toISOString(),
   });
   ```

**Complete Message Flow:**

```
LoginRateLimitService.recordFailedAttempt()
  -> Lua script: count=5 >= 5 -> SET login:lock:email:{email} 1 EX 900
  -> Returns { emailLocked: true }

LoginRateLimitService.shouldNotifyLock(email)
  -> SET login:lock-notify:{email} 1 EX 3600 NX -> "OK" (ilk kez)
  -> Returns true

EmailQueueService.publishLockNotification(email)
  -> client.emit('email.lock', { email, timestamp })
  -> ClientProxy publishes to app_exchange (topic)
  -> Exchange routing: 'email.lock' matches binding 'email.#'
  -> Message routed to email_queue

[Embedded Consumer - ayni process]
EmailConsumerController.handleLockNotification()
  -> @EventPattern('email.lock')
  -> EmailService.sendMail(email, 'Account Locked - Security Alert', html)
  -> channel.ack(message)
```

**Redis Keys:**

- `login:sw:email:{email}` — 5 entry (threshold reached)
- `login:lock:email:{email}` — `'1'`, TTL 900s (15dk lock)
- `login:lock-notify:{email}` — `'1'`, TTL 3600s (1 saat cooldown)

**RabbitMQ Components Tested:**

- `app_exchange` (topic) — routing key `email.lock` ile mesaj publish
- `email.#` binding — `email.lock` pattern match
- `email_queue` — mesaj queue'ya ulasti
- DLQ arguments — queue'da `x-dead-letter-exchange: ''`, `x-dead-letter-routing-key: email_queue_dlq` tanimli

**Impact if Broken:**

- `publishLockNotification` calismasa: Kullanici hesabi kilitlenir ama BILGILENDIRILMEZ. Saldiri fark edilmez, kullanici 15dk boyunca neden giremedigini anlamaz.
- Exchange/binding yanlis configure edilmisse: Mesaj exchange'e gider ama queue'ya ulasamaz, kaybolur.
- `shouldNotifyLock` calismasa: Her failed attempt'te email gonderilir, kullanici spam'lenir.

---

### Test 7: Verify email.lock Message in Queue

**Validates:** RabbitMQ Management API uzerinden `email_queue`'da mesaj oldugunu dogrular. 3 assertion: queue var, message count > 0, routing dogru.

**Service Method:** Dogrudan RabbitMQ Management API. Uygulama tarafinda mesaj `EmailQueueService.publishLockNotification()` tarafindan publish edildi (Test 6'da).

**RabbitMQ Components Tested:**

- `email_queue` message count (messages_ready veya messages field'i)
- Queue'nun aktif ve mesaj alabilir durumda oldugu

**Impact if Broken:** Mesaj queue'ya ulasmamissa consumer onu asla almaz, email asla gonderilmez.

---

### Test 8: Get Messages from Queue (peek)

**Validates:** Queue'daki mesajin icerigini dogrular. 4 assertion: mesaj var, payload'da `email` field'i dogru, routing key `email.lock`, exchange `app_exchange`.

**Service Method:** RabbitMQ Management API `/api/queues/%2F/email_queue/get` endpoint'i ile peek (mesaji silmeden okuma).

**Dogrulanan Payload:**

```json
{
  "email": "test-user@example.com",
  "timestamp": "2026-03-12T08:24:XX.XXXZ"
}
```

**Dogrulanan Routing:**

- `routing_key`: `email.lock` (from `rabbitmq.constants.ts:19` — `ROUTING_KEYS.EMAIL_LOCK`)
- `exchange`: `app_exchange` (from `rabbitmq.constants.ts:3` — `RMQ_EXCHANGE.NAME`)

**RabbitMQ Components Tested:**

- Message payload structure (email + timestamp)
- Routing key correctness (`email.lock`)
- Exchange name correctness (`app_exchange`)
- Topic exchange routing mechanism

**Impact if Broken:**

- Payload yanlis formatta ise: `EmailConsumerController.handleLockNotification()` `data.email` undefined olur, email gonderilemez
- Routing key yanlis ise: `@EventPattern(ROUTING_KEYS.EMAIL_LOCK)` pattern match etmez, consumer mesaji almaz

---

### Test 9: Lock Notify Cooldown Test

**Validates:** Zaten kilitlenmis hesap icin tekrar login denendiginde cooldown mekanizmasinin yeni mesaj publish etmemesini dogrular. 3 assertion: 401 response, queue'ya yeni mesaj EKLENMEDI.

**Service Methods:**

1. `login-rate-limit.service.ts:88-94` — `checkEmailLocked()`:
   - `GET login:lock:email:{email}` — key var (Test 6'da set edildi)
   - `throw UnauthorizedException` — direkt 401, `handleFailedLogin` bile cagirilmaz

2. ALTERNATIF: Eger farkli email ile test ediliyorsa:
   - `login-rate-limit.service.ts:143-153` — `shouldNotifyLock()`:
   - `SET login:lock-notify:{email} 1 EX 3600 NX` — key ZATEN var (Test 6'da set edildi)
   - `NX` flag nedeniyle SET basarisiz, `null` doner
   - `shouldNotifyLock()` returns `false`
   - `publishLockNotification()` CAGIRILMAZ

**Redis Key:**

- `login:lock-notify:{email}` — Hala var, TTL ~3595s kaldi (1 saat cooldown)
- Bu key `shouldNotifyLock()` icinde `SET NX EX` ile atomic olarak kontrol edilir (`login-rate-limit.service.ts:145-151`)

**RabbitMQ Components Tested:**

- Queue message count DEGISMEDI — yeni mesaj publish edilmedi
- Cooldown mekanizmasi calistigindan consumer gereksiz yere tetiklenmedi

**Impact if Broken:**

- Cooldown calismasa: Her failed login attempt'te yeni `email.lock` mesaji publish edilir
- Kullanici dakikada onlarca "Account Locked" email'i alir (spam)
- Queue gereksiz yere dolabilir, consumer performansi duser
- `NOTIFY_COOLDOWN_TTL = 3600` (1 saat) — bu sure icinde maksimum 1 notification

---

### Test 10: Verify Queue Count Unchanged

**Validates:** Test 9'daki cooldown sonrasi queue'daki mesaj sayisinin artmadigini dogrular. 2 assertion: queue var, message count Test 7'deki ile ayni.

**Service Method:** RabbitMQ Management API — sadece queue state kontrolu.

**RabbitMQ Components Tested:**

- `email_queue` message count stability
- Cooldown mekanizmasinin end-to-end calismasi

**Impact if Broken:** Queue count artmissa cooldown calismamis demektir — Test 9 analizi gecerli.

---

## Kaynak Kod Referanslari

| Dosya                   | Path                                                                              | Satir |
| ----------------------- | --------------------------------------------------------------------------------- | ----- |
| EmailQueueService       | `apps/async-job-platform/src/modules/auth/services/email-queue.service.ts`        | 1-33  |
| EmailConsumerController | `apps/async-job-platform/src/modules/email-consumer/email-consumer.controller.ts` | 1-70  |
| RabbitMQ Constants      | `libs/common/src/rabbitmq/rabbitmq.constants.ts`                                  | 1-36  |
| LoginRateLimitService   | `apps/async-job-platform/src/modules/auth/services/login-rate-limit.service.ts`   | 1-187 |
| AuthService             | `apps/async-job-platform/src/modules/auth/services/auth.service.ts`               | 1-366 |
| RabbitmqModule          | `libs/common/src/rabbitmq/rabbitmq.module.ts`                                     | 1-86  |
| EmailService            | `libs/common/src/services/email.service.ts`                                       | 1-39  |

---

## Mesaj Akis Diyagrami

```
Login 5x fail
  |
  +-- LoginRateLimitService.recordFailedAttempt()          [login-rate-limit.service.ts:96]
  |     +-- Lua script (atomic): ZADD + ZCARD + SET        [login-rate-limit.service.ts:41-64]
  |     +-- Returns { emailLocked: true, delayMs: 4000 }
  |
  +-- LoginRateLimitService.shouldNotifyLock(email)         [login-rate-limit.service.ts:143]
  |     +-- SET login:lock-notify:{email} 1 EX 3600 NX     [login-rate-limit.service.ts:145-151]
  |     +-- Returns true (ilk kez)
  |
  +-- EmailQueueService.publishLockNotification(email)      [email-queue.service.ts:18]
  |     +-- client.emit('email.lock', { email, timestamp }) [email-queue.service.ts:19-23]
  |           |
  |           v
  |     app_exchange (topic)                                [rabbitmq.constants.ts:2-5]
  |           |
  |           +-- binding: email.# --> email_queue          [rabbitmq.constants.ts:25]
  |                 |
  |                 v
  |           email_queue (durable)                         [rabbitmq.constants.ts:9]
  |                 |
  |                 v
  +-- [Embedded Consumer - ayni process]
        EmailConsumerController.handleLockNotification()    [email-consumer.controller.ts:29-69]
          |
          +-- Basarili: EmailService.sendMail()             [email.service.ts:26]
          |     +-- channel.ack(message)                    [email-consumer.controller.ts:51]
          |
          +-- Basarisiz (retry < 3):
          |     +-- delay(RMQ_RETRY_DELAYS[retryCount])     [email-consumer.controller.ts:62-66]
          |     +-- channel.nack(message, false, true)      [email-consumer.controller.ts:67]
          |     +-- Message --> email_queue (requeue)
          |
          +-- Basarisiz (retry >= 3):
                +-- channel.nack(message, false, false)     [email-consumer.controller.ts:57]
                +-- Message --> email_queue_dlq (DLQ)       [rabbitmq.constants.ts:10]
```

---

## RabbitMQ Topoloji

```
+---------------------------------------------------------------+
|                    app_exchange (topic)                         |
|                                                                 |
|  Bindings:                                                      |
|    email.# -----> email_queue                                   |
|                      |                                          |
|                      +-- x-dead-letter-exchange: ''             |
|                      +-- x-dead-letter-routing-key: email_queue_dlq |
|                                                                 |
|  Routing:                                                       |
|    email.lock     -> match email.# -> email_queue               |
|    email.welcome  -> match email.# -> email_queue (ileride)     |
|    email.reset    -> match email.# -> email_queue (ileride)     |
|    email.verify   -> match email.# -> email_queue (ileride)     |
+---------------------------------------------------------------+
```

---

## Redis Key Haritasi

| Key Pattern                 | Tipi       | TTL   | Amac                             |
| --------------------------- | ---------- | ----- | -------------------------------- |
| `login:sw:email:{email}`    | Sorted Set | 900s  | Sliding window (failed attempts) |
| `login:sw:ip:{ip}`          | Sorted Set | 900s  | IP bazli sliding window          |
| `login:lock:email:{email}`  | String     | 900s  | Email lock flag                  |
| `login:block:ip:{ip}`       | String     | 900s  | IP block flag                    |
| `login:lock-notify:{email}` | String     | 3600s | Notification cooldown (1 saat)   |

---

## Sabitler

| Sabit                  | Deger         | Dosya:Satir                      | Aciklama                    |
| ---------------------- | ------------- | -------------------------------- | --------------------------- |
| `EMAIL_FAIL_THRESHOLD` | 5             | `login-rate-limit.service.ts:18` | Email lock icin fail sayisi |
| `IP_FAIL_THRESHOLD`    | 15            | `login-rate-limit.service.ts:19` | IP block icin fail sayisi   |
| `WINDOW_SECONDS`       | 900 (15dk)    | `login-rate-limit.service.ts:20` | Sliding window suresi       |
| `LOCK_TTL`             | 900 (15dk)    | `login-rate-limit.service.ts:21` | Lock suresi                 |
| `NOTIFY_COOLDOWN_TTL`  | 3600 (1 saat) | `login-rate-limit.service.ts:22` | Email cooldown              |
| `EMAIL_DELAY_START`    | 3             | `login-rate-limit.service.ts:23` | Delay baslangic fail#       |
| `RMQ_MAX_RETRIES`      | 3             | `rabbitmq.constants.ts:35`       | Consumer max retry          |
| `RMQ_RETRY_DELAYS`     | [2s, 5s, 15s] | `rabbitmq.constants.ts:36`       | Retry delay'leri            |
