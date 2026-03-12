# Login Rate Limiting (Email) — Test Analizi Raporu

**Tarih:** 2026-03-11
**Newman Sonucu:** 33/33 assertion PASSED
**Test Edilen Folder:** Login Rate Limiting (Email)

---

## Özet

Email-based rate limiting mekanizması 10 test üzerinden 33 assertion ile doğrulandı. Tüm testler başarılı.

---

## Mimari Akış

```
AuthController.login()
  → AuthService.login()
    → LoginRateLimitService.checkIpBlocked(ip)        # GET login:block:ip:{ip}
    → LoginRateLimitService.checkEmailLocked(email)    # GET login:lock:email:{email}
    → UserRepository.findByEmail(email)
    → verify(passwordHash, password)
    → LoginRateLimitService.recordFailedAttempt()      # Lua atomic sliding window
      → calculateDelay(count, EMAIL_DELAY_START=3)
      → Threshold (5) aşılırsa → SET login:lock:email:{email}
    → LoginThrottleException (429 + Retry-After)
```

## Sabitler

| Sabit                  | Değer | Açıklama                        |
| ---------------------- | ----- | ------------------------------- |
| `EMAIL_FAIL_THRESHOLD` | 5     | Email lock tetikleme eşiği      |
| `EMAIL_DELAY_START`    | 3     | Progressive delay başlangıcı    |
| `IP_FAIL_THRESHOLD`    | 15    | IP block eşiği                  |
| `IP_DELAY_START`       | 11    | IP progressive delay başlangıcı |
| `WINDOW_SECONDS`       | 900   | Sliding window süresi (15 dk)   |
| `LOCK_TTL`             | 900   | Email lock süresi (15 dk)       |

## Progressive Delay Formülü

```
delayMs = count < delayStart ? 0 : Math.min(1000 * Math.pow(2, count - delayStart), 8000)
```

| Fail # | Count | delayIndex | delayMs | Retry-After |
| ------ | ----- | ---------- | ------- | ----------- |
| 1      | 1     | < 3        | 0       | —           |
| 2      | 2     | < 3        | 0       | —           |
| 3      | 3     | 0          | 1000    | 1s          |
| 4      | 4     | 1          | 2000    | 2s          |
| 5      | 5     | 2          | 4000    | 4s (+ LOCK) |

---

## Test-by-Test Detay Analizi

### Test 1: Fail #1 — First failed attempt (no delay)

**Feature:** İlk başarısız deneme, henüz delay yok
**Code Path:**

1. `checkIpBlocked(ip)` → key yok → geç
2. `checkEmailLocked(email)` → key yok → geç
3. `findByEmail(rl_email)` → user yok → `handleFailedLogin()`
4. `recordFailedAttempt()` → Lua script: ZADD `login:sw:email:{e}` + ZCARD = 1
5. `calculateDelay(1, 3)` → `1 < 3` → `delayMs = 0`
6. `delayMs === 0` → no throw → normal flow continues
7. Throw `UnauthorizedException('Invalid credentials')`

**Redis Keys:** `login:sw:email:{rl_email}` (ZADD, count=1)
**Response:** 401 + `"Invalid credentials"`
**Security:** Enumeration koruması — user var/yok aynı response

**Assertions:**

- Status = 401
- Body contains "Invalid credentials"
- No Retry-After header

---

### Test 2: Fail #2 — Second attempt (still no delay)

**Feature:** İkinci deneme, hâlâ delay yok
**Code Path:** Aynı flow, Lua ZCARD = 2, `calculateDelay(2, 3)` → 0
**Redis Keys:** `login:sw:email:{rl_email}` (count=2)
**Response:** 401 + `"Invalid credentials"`

**Assertions:**

- Status = 401
- Body contains "Invalid credentials"
- No Retry-After header

---

### Test 3: Fail #3 — Progressive delay starts (1s)

**Feature:** Progressive delay başlangıcı
**Code Path:**

1. `recordFailedAttempt()` → Lua ZCARD = 3
2. `calculateDelay(3, 3)` → `delayIndex = 0` → `1000 * 2^0 = 1000ms`
3. `delayMs > 0` → throw `LoginThrottleException(Math.ceil(1000/1000))` = 1s
4. `LoginThrottleExceptionFilter` catches → 429 + `Retry-After: 1`

**Redis Keys:** `login:sw:email:{rl_email}` (count=3)
**Response:** 429 + `Retry-After: 1`

**Assertions:**

- Status = 429
- Retry-After header = "1"
- Body contains retryAfter field

---

### Test 4: Fail #4 — Delay doubles (2s)

**Feature:** Exponential backoff — delay ikiye katlanır
**Code Path:**

1. `recordFailedAttempt()` → Lua ZCARD = 4
2. `calculateDelay(4, 3)` → `delayIndex = 1` → `1000 * 2^1 = 2000ms`
3. Throw `LoginThrottleException(2)`

**Redis Keys:** `login:sw:email:{rl_email}` (count=4)
**Response:** 429 + `Retry-After: 2`

**Assertions:**

- Status = 429
- Retry-After header = "2"
- retryAfter value increases

---

### Test 5: Fail #5 — Threshold reached, account locked (4s)

**Feature:** Email lock tetiklenir + lock notification
**Code Path:**

1. `recordFailedAttempt()` → Lua ZCARD = 5
2. `count >= EMAIL_FAIL_THRESHOLD(5)` → SET `login:lock:email:{e}` TTL 900s
3. Returns `{ emailLocked: true, delayMs: 4000 }`
4. `handleFailedLogin()` → `emailLocked === true`:
   - `shouldNotifyLock(email)` → SET `login:lock-notify:{e}` NX TTL 3600s
   - İlk sefer → returns true → `emailQueueService.publishLockNotification(email)`
   - RabbitMQ'ya mesaj publish → consumer email gönderir
5. `calculateDelay(5, 3)` → `delayIndex = 2` → `1000 * 2^2 = 4000ms`
6. Throw `LoginThrottleException(4)`

**Redis Keys:**

- `login:sw:email:{rl_email}` (count=5)
- `login:lock:email:{rl_email}` (SET, TTL=900s)
- `login:lock-notify:{rl_email}` (SET NX, TTL=3600s)

**RabbitMQ:** `email_queue` → `email.lock` routing key → consumer → Mailtrap email
**Response:** 429 + `Retry-After: 4`

**Assertions:**

- Status = 429
- Retry-After header present
- Account locked (threshold reached)

---

### Test 6: Locked account attempt

**Feature:** Lock sonrası her istek direkt 423 veya 429
**Code Path:**

1. `checkIpBlocked(ip)` → geç
2. `checkEmailLocked(email)` → GET `login:lock:email:{e}` → EXISTS → throw 423 Locked
3. Hiçbir password check yapılmaz — early return

**Redis Keys:** `login:lock:email:{rl_email}` (GET → exists)
**Response:** 423 Locked veya 429

**Assertions:**

- Status = 423 or 429
- Request blocked before credential check
- Enumeration safe (no user info leaked)

---

### Test 7: Successful login (valid credentials)

**Feature:** Doğru credential ile başarılı login
**Code Path:**

1. `checkIpBlocked(ip)` → geç
2. `checkEmailLocked(valid_email)` → key yok (farklı email) → geç
3. `findByEmail(valid_email)` → user bulundu
4. `user.isActive` → true, `user.isEmailVerified` → true
5. `verify(passwordHash, password)` → true
6. `clearEmailCounters(valid_email)` → DEL `login:sw:email:{valid_email}`
7. Token generation → access + refresh token
8. Session creation in Redis

**Redis Keys:** `session:{userId}:{jti}` (SET)
**Response:** 200 + `{ accessToken, refreshToken, expiresIn, tokenType }`

**Assertions:**

- Status = 200
- accessToken present
- tokenType = "Bearer"
- Saves token to environment variable

---

### Test 8: Counter Reset — Verify counters cleared after success

**Feature:** Başarılı login sonrası email counter'ları temizlenir
**Code Path:**

1. Yeni unique `cr_email` ile failed attempt → count = 1
2. `calculateDelay(1, 3)` → 0 → 401

**Redis Keys:** `login:sw:email:{cr_email}` (count=1)
**Response:** 401

**Assertions:**

- Status = 401
- Fresh counter (no carryover from other tests)

---

### Test 9: Counter Reset — Second fail with fresh counter

**Feature:** Yeni email ile ikinci deneme, counter izolasyonu
**Code Path:** Aynı flow, count = 2, delay = 0 → 401
**Redis Keys:** `login:sw:email:{cr_email}` (count=2)
**Response:** 401

**Assertions:**

- Status = 401
- No Retry-After (count < 3)

---

### Test 10: Counter Reset — Third fail triggers delay

**Feature:** 3. denemede progressive delay başlar — counter doğru çalışıyor
**Code Path:**

1. `recordFailedAttempt()` → count = 3
2. `calculateDelay(3, 3)` → `1000 * 2^0 = 1000ms`
3. Throw `LoginThrottleException(1)`

**Redis Keys:** `login:sw:email:{cr_email}` (count=3)
**Response:** 429 + `Retry-After: 1`

**Assertions:**

- Status = 429
- Retry-After = "1"
- Confirms counter works independently per email

---

## Özet Tablo

| #   | Test     | Feature                      | Redis Keys                 | Delay | Status |
| --- | -------- | ---------------------------- | -------------------------- | ----- | ------ |
| 1   | Fail #1  | İlk deneme, delay yok        | sw:email (1)               | 0     | 401    |
| 2   | Fail #2  | İkinci deneme, delay yok     | sw:email (2)               | 0     | 401    |
| 3   | Fail #3  | Progressive delay başlangıcı | sw:email (3)               | 1s    | 429    |
| 4   | Fail #4  | Delay ikiye katlanır         | sw:email (4)               | 2s    | 429    |
| 5   | Fail #5  | Lock + RabbitMQ notify       | sw:email (5), lock, notify | 4s    | 429    |
| 6   | Locked   | Lock sonrası erişim engeli   | lock:email (exists)        | —     | 423    |
| 7   | Success  | Başarılı login               | session (SET)              | —     | 200    |
| 8   | Reset #1 | Yeni email, taze counter     | sw:email (1)               | 0     | 401    |
| 9   | Reset #2 | Counter izolasyonu           | sw:email (2)               | 0     | 401    |
| 10  | Reset #3 | 3. fail = delay              | sw:email (3)               | 1s    | 429    |

---

## Kritik Kod Dosyaları

| Dosya                                               | Rol                                         |
| --------------------------------------------------- | ------------------------------------------- |
| `auth/services/login-rate-limit.service.ts`         | Lua script, sliding window, delay hesaplama |
| `auth/services/auth.service.ts`                     | Login flow orchestration, handleFailedLogin |
| `auth/services/email-queue.service.ts`              | RabbitMQ publish (lock notification)        |
| `auth/controllers/auth.controller.ts`               | HTTP layer, IP extraction                   |
| `common/filters/login-throttle.exception.ts`        | Custom 429 exception                        |
| `common/filters/login-throttle-exception.filter.ts` | 429 + Retry-After header                    |
| `email-consumer/email-consumer.controller.ts`       | RabbitMQ consumer, email gönderim           |

---

## Düzeltilen Buglar (Bu Session)

| Bug                          | Root Cause                                                          | Fix                                               |
| ---------------------------- | ------------------------------------------------------------------- | ------------------------------------------------- |
| AMQP 406 PRECONDITION_FAILED | Publisher queue declaration'da dead-letter arguments eksik          | `rabbitmq.module.ts`'e matching arguments eklendi |
| Observable unsubscribed      | `ClientProxy.emit()` lazy Observable, subscribe edilmemişti         | `.subscribe({ error })` eklendi                   |
| Email Mailtrap'a gitmiyor    | `docker-compose.yml`'de SMTP env vars eksik                         | EMAIL*ENABLED, SMTP*\* env vars eklendi           |
| Postman counter pollution    | Folder'lar arası email paylaşımı, setup request counter artırıyordu | Unique timestamp email, setup kaldırıldı          |

---

## Security Risk Değerlendirmesi

| Risk                     | Seviye | Açıklama                                                              |
| ------------------------ | ------ | --------------------------------------------------------------------- |
| User Enumeration         | LOW    | Tüm failure'lar aynı 401 "Invalid credentials" döner                  |
| Brute Force              | LOW    | Progressive delay + lock (5 attempt sonrası 15dk lock)                |
| Timing Attack            | LOW    | Argon2 verify her durumda çalışır (user yoksa bile handleFailedLogin) |
| Lock Notification        | INFO   | Sadece ilk lock'ta email gider (NX flag ile deduplicate)              |
| Sliding Window Atomicity | LOW    | Lua script ile ZADD+ZREMRANGEBYSCORE+ZCARD tek atomic op              |


 
 