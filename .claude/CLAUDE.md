# CLAUDE.md

## Rules

- Do NOT read files outside the target module unless explicitly told
- Do NOT run `find`, `tree`, or `ls` on root directory
- Do NOT cat entire files — read only relevant sections
- Fail output'larında sadece error summary göster, full stack trace basma
- Implementasyon öncesi ilgili plan dosyasını oku, tüm plan dosyalarını değil
- Her değişiklik sonrası `npm run build` çalıştır
- Security kuralları: `.claude/rules/security-rules.md` (auth dosyalarıyla çalışırken otomatik yüklenir)
- RabbitMQ kuralları: `.claude/rules/rabbitmq-rules.md` (queue dosyalarıyla çalışırken otomatik yüklenir)
- Auth modül detayları: `modules/auth/CLAUDE.md` (auth klasöründe çalışırken otomatik yüklenir)

## Proje

**Async Job Platform** — uzun süren job'lar (rapor, CSV import, webhook) API üzerinden submit edilir, RabbitMQ ile kuyruğa alınır, worker'lar arka planda işler.

Hybrid application pattern: API process hem HTTP hem RabbitMQ consumer dinler.

## Komutlar

```bash
npm run start:dev          # API (port 3000) + embedded RMQ consumer
npm run start:worker:dev   # Worker (port 3001)
npm run build              # TypeScript doğrulama
docker-compose up -d       # PostgreSQL, Redis, RabbitMQ
```

## Yapı

```
apps/async-job-platform/src/
  ├── main.ts              # Fastify + connectMicroservice (hybrid)
  ├── app.module.ts        # Root (global JwtAuthGuard, RabbitmqModule.forRoot)
  ├── common/filters/      # LoginThrottleExceptionFilter
  └── modules/
      ├── auth/            # Login, register, session, rate limiting, email queue
      ├── jobs/            # Job CRUD + queue management
      └── email-consumer/  # RabbitMQ email consumer (embedded)

apps/worker/               # Arka plan job işleyici

libs/common/src/
  ├── entities/            # User, Job, RefreshToken, LoginAudit
  ├── enums/               # Role, JobStatus, LoginAuditResult, LoginFailReason
  ├── repositories/        # BaseRepository
  ├── rabbitmq/            # RabbitmqModule (forRoot + forFeature), constants
  └── services/            # EmailService (SMTP — paylaşılan)
```

Path alias: `@app/common` → `libs/common/src`

## Stack

NestJS + Fastify, TypeScript (strict), PostgreSQL 16 (TypeORM), Redis 7 (ioredis), RabbitMQ 3 (topic exchange + DLQ), JWT, class-validator, Swagger, Helmet.

## Conventions

- Business logic → Service, asla Controller'da
- DTOs + class-validator — tüm input'lar validate edilmeli
- Repository pattern — abstract interface + TypeORM implementasyonu
- Barrel exports — her klasörde `index.ts`
- Entity: UUID PK, snake_case tablo, `@CreateDateColumn()` / `@UpdateDateColumn()`
- Git: `feat(module):`, `fix(module):`, `refactor(module):` — atomic, focused
- Türkçe açıklamalar, teknik terimlerde İngilizce
- Mimari kararlardan önce sor

## Plan Dosyaları

`docs/plans/auth/` veya `plans/` — implementasyon öncesi ilgili planı oku.

| Step  | Dosya                            | Durum |
| ----- | -------------------------------- | ----- |
| 00    | `00-auth-overview.md`            | ✅    |
| 01    | `01-auth-cleanup.md`             | ✅    |
| 02    | `02-auth-simplify.md`            | ✅    |
| 02.3  | `register-rate-limiting.md`      | ✅    |
| 02.7  | `login-rate-limiting.md`         | ✅    |
| 02.8  | `login-hardening.md`             | ✅    |
| 02.8.1| `login-audit-log.md`             | 📋    |
| 06    | `email-queue-rabbitmq.md`        | ✅    |
| 04    | `04-api-keys.md`                 | 📋    |
| 05    | `05-totp-2fa.md`                 | 📋    |

## MCP

postgres, redis, postman bağlı. DB inspection ve collection yönetimi için kullan.

## Tooling

- **Skills:** `skills/user/newman-test-runner/` — Postman collection test automation
- **Agents:** `.claude/agents/` — log-analyzer, code-analyzer, backend-architect, test-agent, ...
- **Commands:** `.claude/commands/post-implement.md` — Agent Teams pipeline

## Compaction

When compacting, always preserve:
- Modified files list
- Redis key patterns and RabbitMQ routing keys
- Test results and assertion counts
- Plan dosyası durumları (✅/📋)