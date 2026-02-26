# 03 — Register Rate Limiting

## Amaç

IP tabanlı Redis rate limit guard oluştur. Register endpoint'ine özel. Spam kayıtları engelle.

---

## Yeni Dosya

```
apps/async-job-platform/src/modules/auth/guards/register-rate-limit.guard.ts
```

---

## Implementasyon

```typescript
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';

@Injectable()
export class RegisterRateLimitGuard implements CanActivate {
  private readonly MAX_REGISTRATIONS = 5;
  private readonly WINDOW_SECONDS = 3600; // 1 saat

  constructor(
    @InjectRedis()
    private readonly redis: Redis,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const ip =
      request.ip || request.headers['x-forwarded-for']?.toString() || 'unknown';
    const key = `register:ratelimit:${ip}`;

    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, this.WINDOW_SECONDS);
    }

    if (count > this.MAX_REGISTRATIONS) {
      throw new HttpException(
        'Too many registration attempts. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
```

### Tasarım Kararları

- **5 kayıt / IP / saat** — makul bir limit, gerçek kullanıcıları engellemez
- **Redis INCR + EXPIRE** — atomic, race condition yok (INCR yoksa key oluşturur)
- **x-forwarded-for desteği** — proxy/load balancer arkasında çalışır
- **429 Too Many Requests** — standart HTTP status kodu

---

## Guard Index Güncelleme

```typescript
// apps/async-job-platform/src/modules/auth/guards/index.ts
export * from './jwt-auth.guard';
export * from './local-auth.guard';
export * from './roles.guard';
export * from './register-rate-limit.guard'; // YENİ
```

---

## auth.module.ts Güncelleme

```typescript
// providers'a ekle:
RegisterRateLimitGuard,

// import'a ekle:
import { RegisterRateLimitGuard } from './guards';
```

---

## auth.controller.ts — Register Endpoint Güncelleme

```typescript
// ÖNCE:
@Public()
@Post('register')
async register(@Body() dto: RegisterDto) { ... }

// SONRA:
@Public()
@UseGuards(RegisterRateLimitGuard)
@Post('register')
@ApiResponse({
  status: 429,
  description: 'Too many registration attempts from this IP',
})
async register(@Body() dto: RegisterDto) { ... }
```

---

## Doğrulama

```bash
npm run build
```

- Build başarılı olmalı
- Guard NestJS DI container'a düzgün kayıtlı olmalı
- 6. register denemesi → 429 hatası vermeli

---

## Kontrol Listesi

- [ ] `register-rate-limit.guard.ts` oluştur
- [ ] `guards/index.ts` güncelle
- [ ] `auth.module.ts` — provider olarak ekle
- [ ] `auth.controller.ts` — register endpoint'ine `@UseGuards(RegisterRateLimitGuard)` ekle
- [ ] Swagger'a 429 response ekle
- [ ] `npm run build` — başarılı
