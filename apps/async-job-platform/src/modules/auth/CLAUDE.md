# Auth Module

## Dosya Yapısı

```
modules/auth/
├── controllers/       # AuthController → /api/v1/auth/*
├── services/
│   ├── auth.service.ts              # Login/register orchestration
│   ├── token.service.ts             # JWT access + refresh token
│   ├── session.service.ts           # Redis session management
│   ├── login-rate-limit.service.ts  # Sliding window (Lua script)
│   ├── email-queue.service.ts       # RabbitMQ publisher
│   └── login-audit.service.ts       # Audit log publisher
├── guards/
│   ├── jwt-auth.guard.ts            # Global JWT (APP_GUARD)
│   ├── local-auth.guard.ts          # Login credential validation
│   ├── roles.guard.ts               # RBAC
│   └── register-rate-limit.guard.ts # Register IP rate limit
├── strategies/        # JwtStrategy, LocalStrategy
├── decorators/        # @Public(), @CurrentUser(), @Roles()
├── repositories/      # UserRepository, RefreshTokenRepository
└── dto/               # RegisterDto, LoginDto, TokensResponseDto
```

## Auth Flow

```
Register: validate DTO → check duplicate → hash password → save user → send verification email
Login: check IP block → check email lock → find user → isActive → isEmailVerified → bcrypt → generate tokens → create session
Logout: blacklist access token → delete session → revoke refresh token
Refresh: validate refresh token → check reuse → rotate tokens → new session
```

## Redis Key Patterns

```
session:{userId}:{jti}          # Active session — SET, TTL matches access token
blacklist:jwt:{jti}             # Blacklisted token — SET, TTL matches token expiry
register:ratelimit:{ip}         # Register limit — INCR + EXPIRE (fixed window)
login:sw:email:{email}          # Login fail — Sorted Set (sliding window)
login:sw:ip:{ip}                # Login fail IP — Sorted Set (sliding window)
login:lock:email:{email}        # Email lock — String "1", TTL 900s
login:block:ip:{ip}             # IP block — String "1", TTL 900s
login:lock-notify:{email}       # Notification cooldown — String "1", TTL 3600s
resend-verification:{email}     # Resend limit — INCR + EXPIRE
```

Yeni key eklerken: prefix pattern'i takip et (`login:`, `session:`, `register:`).

## Rate Limiting Constants

```
EMAIL_FAIL_THRESHOLD = 5        # 5 fail → email lock
IP_FAIL_THRESHOLD = 15          # 15 fail → IP block
WINDOW_SECONDS = 900            # 15min sliding window
LOCK_TTL = 900                  # 15min lock/block duration
NOTIFY_COOLDOWN_TTL = 3600      # 1hr email notification cooldown
EMAIL_DELAY_START = 3           # Progressive delay 3. fail'den başlar
IP_DELAY_START = 11             # IP delay 11. fail'den başlar
```

Progressive delay formula: `Math.min(1000 * Math.pow(2, count - delayStart), 8000)`

## LoginRateLimitService

Lua script ile atomic sliding window. Tek Redis roundtrip'te: ZREMRANGEBYSCORE + ZADD + ZCARD + threshold check + lock SET.

Race condition yok — Lua script atomic çalışır.

## Login Failure Handling

```
AuthService.login() fail →
  handleFailedLogin(email, ip) →
    loginRateLimitService.recordFailedAttempt() →
      Lua script → count + delay + lock status
    if emailLocked:
      shouldNotifyLock() → SET NX (atomic cooldown check)
      if true: emailQueueService.publishLockNotification() (fire-and-forget)
    throw UnauthorizedException('Invalid credentials')
```

## Custom Exception

`LoginThrottleException` → 429 + `Retry-After` header. `LoginThrottleExceptionFilter` bunu yakalar ve response formatlar.