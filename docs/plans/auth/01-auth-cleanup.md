# Step 01: Auth Cleanup

## Scope

Gereksiz dosyaları sil, referansları temizle, build doğrula.
Sadece bu plandaki dosyalara dokun, başka bir şey değiştirme.

## Sil (16 dosya)

apps/async-job-platform/src/modules/auth/services/phone.service.ts
apps/async-job-platform/src/modules/auth/services/login-history.service.ts
apps/async-job-platform/src/modules/auth/services/login-stats.service.ts
apps/async-job-platform/src/modules/auth/services/risk-tracking.service.ts
apps/async-job-platform/src/modules/auth/services/risk-scoring.service.ts
apps/async-job-platform/src/modules/auth/services/risk-monitor.service.ts
apps/async-job-platform/src/modules/auth/controllers/login-history.controller.ts
apps/async-job-platform/src/modules/auth/controllers/risk-dashboard.controller.ts
apps/async-job-platform/src/modules/auth/dto/phone-verify.dto.ts
libs/common/src/entities/phone-verification.entity.ts
libs/common/src/entities/login-history.entity.ts
libs/common/src/enums/login-history.enum.ts (varsa)
apps/async-job-platform/src/modules/auth/repositories/phone-verification.repository.interface.ts
apps/async-job-platform/src/modules/auth/repositories/phone-verification.repository.ts
apps/async-job-platform/src/modules/auth/repositories/login-history.repository.interface.ts
apps/async-job-platform/src/modules/auth/repositories/login-history.repository.ts

## Referans Temizliği

Silinen dosyaların export/import'larını şu index dosyalarından kaldır:

- modules/auth/services/index.ts
- modules/auth/controllers/index.ts
- modules/auth/dto/index.ts
- modules/auth/repositories/index.ts
- libs/common/src/entities/index.ts

## auth.module.ts

- TypeOrmModule.forFeature → PhoneVerification, LoginHistory kaldır
- ScheduleModule.forRoot() kaldır (artık cron job yok)
- controllers → LoginHistoryController, RiskDashboardController kaldır
- providers → silinen 6 service + 4 repository provider kaldır

## auth.controller.ts

- PhoneService inject'ini constructor'dan kaldır
- @Post('phone/resend-code') endpoint'ini kaldır
- @Post('phone/verify') endpoint'ini kaldır

## Son

```bash
npm uninstall twilio
npm run build
```

Build 0 error olmalı.

## Dokunma

- DTO içerikleri (Step 2'de yapılacak)
- Service iç logikleri (Step 2'de yapılacak)
- Guard'lar, Strategy dosyaları
- Jobs modülü, Worker, libs/common dışındaki dosyalar