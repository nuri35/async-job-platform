# CLAUDE.md

Bu dosya Claude Code'un bu repository'de nasıl çalışacağını belirler.

## Claude Code Rules

- Do NOT read files outside the target module unless explicitly told
- Do NOT run `find`, `tree`, or `ls` on root directory
- Do NOT cat entire files — read only relevant sections
- Do NOT run all tests — only run tests for the target module
- Fail output'larında sadece error summary göster, full stack trace basma
- Implementasyon öncesi ilgili plan dosyasını oku, tüm plan dosyalarını değil
- Başka dosyaya bakma denmişse sadece verilen dosyalarla çalış

## Proje Amacı

**Async Job Platform** — kullanıcılar API üzerinden uzun süren job'lar submit eder (rapor üretimi, CSV import, webhook), RabbitMQ ile kuyruğa alınır, worker'lar tarafından arka planda işlenir.

**Auth** bu platformun kapısıdır — JWT tabanlı oturum yönetimi, API key ile dış servis erişimi ve opsiyonel 2FA.

> Auth modülü aktif olarak sadeleştiriliyor. Detaylı plan: `docs/plans/auth/`

## Komutlar

```bash
npm run start:dev          # API (port 3000) — watch mode
npm run start:worker:dev   # Worker (port 3001) — watch mode
npm run build              # API build (TypeScript doğrulama)
npm run build:worker       # Worker build
npm run lint               # ESLint with auto-fix
npm run format             # Prettier formatting
docker-compose up -d       # Tüm servisler (PostgreSQL, Redis, RabbitMQ)
```

## Tech Stack

NestJS + Fastify, TypeScript (strict), PostgreSQL 16 (TypeORM), Redis 7 (ioredis), RabbitMQ 3 (amqplib), JWT (access + refresh), class-validator, Swagger, Helmet, CORS, CSRF (double submit cookie), rate limiting.

## Monorepo Yapısı

```
apps/
├── async-job-platform/        # Ana API (port 3000)
│   └── src/
│       ├── main.ts            # Fastify bootstrap, Swagger, CORS, Helmet
│       ├── app.module.ts      # Root module (global JwtAuthGuard)
│       ├── config/            # Database + Redis config factories
│       ├── common/            # App-level guards, decorators, validators
│       └── modules/
│           ├── auth/          # Kimlik doğrulama modülü
│           └── jobs/          # Job yönetim modülü
│
├── worker/                    # Arka plan job işleyici (port 3001)
│
libs/
└── common/                    # Paylaşılan kod (API + Worker)
    └── src/
        ├── entities/          # User, Job, RefreshToken, ApiKey
        ├── enums/             # Role, JobStatus, JobType
        ├── interfaces/        # JwtPayload, JwtRefreshPayload
        └── repositories/      # BaseRepository (generic CRUD)
```

### Path Alias

- `@app/common` → `libs/common/src`

## Auth Modülü (Özet)

```
modules/auth/
├── controllers/    # AuthController → /auth/*
├── services/       # AuthService, TokenService, SessionService
├── guards/         # JwtAuthGuard, RolesGuard
├── strategies/     # JwtStrategy, LocalStrategy (Passport)
├── decorators/     # @Public(), @CurrentUser(), @Roles()
├── repositories/   # UserRepository, RefreshTokenRepository
└── dto/            # RegisterDto, LoginDto, TokensResponseDto
```

- Tüm route'lar default JWT korumalı (`APP_GUARD`), public yapmak için `@Public()`
- Refresh token → HttpOnly cookie, access token → response body
- Redis key pattern'leri: `session:{userId}:{jti}`, `blacklist:jwt:{jti}`, `ratelimit:*`
- Endpoint detayları ve auth flow için: `docs/plans/auth/00-auth-overview.md`

## Jobs Modülü (Özet)

```
modules/jobs/
├── jobs.controller.ts     # /jobs/* endpoints
├── jobs.service.ts        # CRUD, retry, stats, queue management
├── repositories/          # JobsRepository
└── dto/                   # CreateJobDto, UpdateJobDto
```

- Job lifecycle: QUEUED → PROCESSING → SUCCESS/FAILED → RETRYING
- Entity detayları: `libs/common/src/entities/job.entity.ts`
- Worker henüz minimal — RabbitMQ consumer implementasyonu gelecek

## NestJS Conventions

- **Business logic → Service**, asla Controller'da
- **DTOs** + `class-validator` — tüm input'lar validate edilmeli
- **Repository pattern** — abstract interface + TypeORM implementasyonu
- **Guards** — auth, rate limiting, CSRF
- **Decorators** — `@Public()`, `@CurrentUser()`, `@Roles()`, `@RateLimit()`
- **Barrel exports** — her klasörde `index.ts`
- Entity'ler: UUID PK, snake_case tablo, `@CreateDateColumn()` / `@UpdateDateColumn()`

### Dosya Organizasyonu

```
module/
├── module-name.module.ts
├── controllers/*.controller.ts
├── services/*.service.ts
├── repositories/*.repository.interface.ts + *.repository.ts
├── guards/*.guard.ts
├── dto/*.dto.ts
└── index.ts
```

### Git Commits

`feat(module):`, `fix(module):`, `refactor(module):`, `docs(module):` — atomic, focused.

### Communication

- Türkçe açıklamalar, teknik terimlerde İngilizce
- Mimari kararlardan önce sor
- Bug fix'lerde önce root cause açıkla

## Aktif Restructuring

Plan dosyaları: `docs/plans/auth/`

| Step | Dosya                          | Konu                               |
| ---- | ------------------------------ | ---------------------------------- |
| 0    | `00-auth-overview.md`          | Genel bakış                        |
| 1    | `01-auth-cleanup.md`           | Gereksiz dosyaları sil             |
| 2    | `02-auth-simplify.md`          | DTO/service sadeleştirme           |
| 3    | `03-register-rate-limiting.md` | IP tabanlı Redis rate limit        |
| 4    | `04-api-keys.md`               | API key sistemi                    |
| 5    | `05-totp-2fa.md`               | TOTP 2FA                          |

> Implementasyon öncesi ilgili plan dosyasını oku.

## Önemli Notlar

1. `npm run build` — her değişiklik sonrası TypeScript doğrulama yap
2. `jobtesss.controller.ts` experimental — production'da kaldırılacak