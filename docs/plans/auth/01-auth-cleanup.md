# 01 — Auth Cleanup (Dosya Silme)

## Amaç

Gereksiz servisleri, controller'ları, DTO'ları, entity'leri ve repository'leri sil. Tüm referansları temizle. Build'in kırılmadığını doğrula.

---

## Silinecek Dosyalar (16 dosya)

### Services (6 dosya)

```
apps/async-job-platform/src/modules/auth/services/phone.service.ts
apps/async-job-platform/src/modules/auth/services/login-history.service.ts
apps/async-job-platform/src/modules/auth/services/login-stats.service.ts
apps/async-job-platform/src/modules/auth/services/risk-tracking.service.ts
apps/async-job-platform/src/modules/auth/services/risk-scoring.service.ts
apps/async-job-platform/src/modules/auth/services/risk-monitor.service.ts
```

### Controllers (2 dosya)

```
apps/async-job-platform/src/modules/auth/controllers/login-history.controller.ts
apps/async-job-platform/src/modules/auth/controllers/risk-dashboard.controller.ts
```

### DTOs (1 dosya)

```
apps/async-job-platform/src/modules/auth/dto/phone-verify.dto.ts
```

### Entities (libs/common — 2-3 dosya)

```
libs/common/src/entities/phone-verification.entity.ts
libs/common/src/entities/login-history.entity.ts
```

> Not: `login-history.enum.ts` varsa o da silinecek. Enum'lar `libs/common/src/enums/` altında olabilir — kontrol edilecek.

### Repositories (4 dosya)

```
apps/async-job-platform/src/modules/auth/repositories/phone-verification.repository.interface.ts
apps/async-job-platform/src/modules/auth/repositories/phone-verification.repository.ts
apps/async-job-platform/src/modules/auth/repositories/login-history.repository.interface.ts
apps/async-job-platform/src/modules/auth/repositories/login-history.repository.ts
```

---

## Güncellenecek Index Dosyaları

### `services/index.ts` — Şu anki hali:

```typescript
export * from './session.service';
export * from './token.service';
export * from './phone.service'; // SİL
export * from './auth.service';
export * from './login-stats.service'; // SİL
export * from './login-history.service'; // SİL
export * from './risk-tracking.service'; // SİL
export * from './risk-scoring.service'; // SİL
export * from './risk-monitor.service'; // SİL
```

**Sonra:**

```typescript
export * from './session.service';
export * from './token.service';
export * from './auth.service';
```

### `controllers/index.ts` — Şu anki hali:

```typescript
export * from './auth.controller';
export * from './login-history.controller'; // SİL
export * from './risk-dashboard.controller'; // SİL
```

**Sonra:**

```typescript
export * from './auth.controller';
```

### `dto/index.ts` — Şu anki hali:

```typescript
export * from './register.dto';
export * from './login.dto';
export * from './phone-verify.dto'; // SİL
export * from './tokens-response.dto';
```

**Sonra:**

```typescript
export * from './register.dto';
export * from './login.dto';
export * from './tokens-response.dto';
```

### `repositories/index.ts` — Şu anki hali:

```typescript
export * from './user.repository.interface';
export * from './user.repository';
export * from './refresh-token.repository.interface';
export * from './refresh-token.repository';
export * from './phone-verification.repository.interface'; // SİL
export * from './phone-verification.repository'; // SİL
export * from './login-history.repository.interface'; // SİL
export * from './login-history.repository'; // SİL
```

**Sonra:**

```typescript
export * from './user.repository.interface';
export * from './user.repository';
export * from './refresh-token.repository.interface';
export * from './refresh-token.repository';
```

### `libs/common/src/entities/index.ts` — Şu anki hali:

```typescript
export * from './job.entity';
export * from './user.entity';
export * from './refresh-token.entity';
export * from './phone-verification.entity'; // SİL
export * from './login-history.entity'; // SİL
```

**Sonra:**

```typescript
export * from './job.entity';
export * from './user.entity';
export * from './refresh-token.entity';
```

---

## auth.module.ts Güncellemesi

### Kaldırılacak import'lar:

```typescript
// Entity import'larından kaldır:
(PhoneVerification, LoginHistory);

// Controller import'larından kaldır:
(LoginHistoryController, RiskDashboardController);

// Service import'larından kaldır:
(PhoneService,
  LoginStatsService,
  LoginHistoryService,
  RiskTrackingService,
  RiskScoringService,
  RiskMonitorService);

// Repository import'larından kaldır:
(IPhoneVerificationRepository,
  PhoneVerificationRepository,
  ILoginHistoryRepository,
  LoginHistoryRepository);
```

### Kaldırılacak module kayıtları:

```typescript
// imports → TypeOrmModule.forFeature'dan kaldır:
(PhoneVerification, LoginHistory);

// imports'tan kaldır (artık cron job yok):
ScheduleModule.forRoot();

// controllers'dan kaldır:
(LoginHistoryController, RiskDashboardController);

// providers'dan kaldır:
(PhoneService,
  LoginStatsService,
  LoginHistoryService,
  RiskTrackingService,
  RiskScoringService,
  RiskMonitorService,
  {
    provide: IPhoneVerificationRepository,
    useClass: PhoneVerificationRepository,
  },
  { provide: ILoginHistoryRepository, useClass: LoginHistoryRepository });
```

### Sonuç auth.module.ts yapısı:

```typescript
@Module({
  imports: [
    TypeOrmModule.forFeature([User, RefreshToken]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({ ... }),
    RedisModule.forRootAsync({ useClass: RedisConfig }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService, TokenService, SessionService,
    { provide: IUserRepository, useClass: UserRepository },
    { provide: IRefreshTokenRepository, useClass: RefreshTokenRepository },
    JwtStrategy, LocalStrategy,
    JwtAuthGuard, RolesGuard,
  ],
  exports: [AuthService, TokenService, SessionService, JwtAuthGuard, RolesGuard, IUserRepository],
})
```

---

## auth.controller.ts Güncellemesi

### Kaldırılacak import'lar ve inject'ler:

```typescript
// Import'lardan kaldır:
import { PhoneService } from '../services';
import { SendPhoneCodeDto, VerifyPhoneCodeDto } from '../dto';

// Constructor'dan kaldır:
private readonly phoneService: PhoneService,
```

### Kaldırılacak endpoint'ler:

```typescript
// Bu 2 endpoint tamamen silinecek:
@Post('phone/resend-code')   // resendPhoneCode()
@Post('phone/verify')         // verifyPhone()
```

---

## npm Paket Kaldırma

```bash
npm uninstall twilio
```

> Not: Twilio sadece `phone.service.ts` tarafından kullanılıyordu. LoginHistory ve Risk servisleri harici paket kullanmıyor.

---

## Doğrulama

```bash
npm run build
```

- Build başarılı olmalı
- Silinen dosyalara hiçbir referans kalmamış olmalı
- `ScheduleModule` import'u kaldırılmış olmalı (artık cron job yok)

---

## Kontrol Listesi

- [ ] 6 service dosyasını sil
- [ ] 2 controller dosyasını sil
- [ ] 1 DTO dosyasını sil
- [ ] 2 entity dosyasını sil (+ enum varsa)
- [ ] 4 repository dosyasını sil
- [ ] `services/index.ts` güncelle
- [ ] `controllers/index.ts` güncelle
- [ ] `dto/index.ts` güncelle
- [ ] `repositories/index.ts` güncelle
- [ ] `libs/common/src/entities/index.ts` güncelle
- [ ] `auth.module.ts` güncelle
- [ ] `auth.controller.ts` — phone endpoint'lerini ve PhoneService inject'ini kaldır
- [ ] `npm uninstall twilio`
- [ ] `npm run build` — başarılı
