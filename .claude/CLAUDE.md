# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
npm run start:dev          # Start API in watch mode
npm run start:worker:dev   # Start Worker in watch mode

# Build
npm run build              # Build API
npm run build:worker       # Build Worker

# Quality
npm run lint               # ESLint with auto-fix
npm run format             # Prettier formatting

# Docker (Infrastructure)
docker-compose up -d                    # Start all services (PostgreSQL, Redis, RabbitMQ)
docker-compose up -d postgres redis     # Start only DB services
docker-compose logs -f api              # Follow API logs
```

## Project Architecture

**NestJS monorepo** with async job processing and security monitoring.

### Tech Stack
- **Framework:** NestJS + Fastify
- **Language:** TypeScript
- **Database:** PostgreSQL (TypeORM)
- **Cache/Sessions:** Redis (ioredis)
- **Message Queue:** RabbitMQ (amqplib)
- **Auth:** JWT (access + refresh tokens)
- **API Docs:** Swagger

### Monorepo Structure

```
apps/
├── async-job-platform/    # Main API (port 3000)
│   └── src/modules/auth/  # Auth & security monitoring
└── worker/                # Background job processor (port 3001)

libs/
└── common/                # Shared entities, repositories, utils
```

### Key Directories
- `apps/async-job-platform/src/modules/auth/` → Auth module with risk monitoring
- `libs/common/src/entities/` → TypeORM entities (shared)
- `libs/common/src/repositories/` → Data access layer

## Auth Module

### Services
| Service | Purpose |
|---------|---------|
| `AuthService` | Login, register, token management |
| `SessionService` | Redis session management, rate limiting |
| `TokenService` | JWT generation/validation |
| `LoginHistoryService` | PostgreSQL login audit trail |
| `LoginStatsService` | Redis real-time stats (HyperLogLog) |
| `RiskTrackingService` | Redis attack tracking (IP, FP, Email) |
| `RiskScoringService` | Risk score calculation (0-100) |
| `RiskMonitorService` | CronJob (30s) monitoring and alerts |

### Controllers
- `AuthController` → /auth/*
- `LoginHistoryController` → /login-history/*
- `RiskDashboardController` → /risk-dashboard/* (Admin)

## Security & Risk Monitoring

### Rate Limiting
- Device fingerprint: 20 attempts / 15 min
- Per email-device: 5 failed = 1 hour block
- 3 blocks = account deactivation

### 3-Dimensional Risk Tracking (Redis)

| Dimension | Keys | Purpose |
|-----------|------|---------|
| IP | `risk:attempts`, `risk:active`, `risk:ip:{ip}:targets` | Track attacker IPs |
| Fingerprint | `risk:fp:active`, `risk:fp:{fp}:ips`, `risk:fp:{fp}:targets` | VPN detection |
| Email | `risk:email:active`, `risk:email:{email}:ips` | Victim protection |

### Attack Detection
- **BRUTE_FORCE:** 1 IP → 1 Email (many attempts)
- **CREDENTIAL_STUFFING:** 1 IP → Many Emails
- **VPN_ROTATION:** 1 Fingerprint → Many IPs
- **DISTRIBUTED_ATTACK:** Many IPs → 1 Email

### Risk Scoring (0-100)
- Levels: LOW (<25), MEDIUM (25-49), HIGH (≥50)
- Redis keys have 1-hour TTL

## Conventions

### NestJS Patterns
- Business logic in Services, never in Controllers
- DTOs with class-validator for all inputs
- Repository pattern for database operations
- Guards for auth, Interceptors for response transformation
- `@Cron()` with `isRunning` flag to prevent overlap

### Git Commits
- Format: `feat(module):`, `fix(module):`, `style(module):`
- Atomic, focused changes

### Communication
- Turkish explanations welcome
- Ask architecture questions before implementing
- For bug fixes: explain root cause first

## Important Notes

1. When modifying risk tracking, update all 3 dimensions (IP, FP, Email)
2. CronJob runs every 30 seconds - be mindful of performance
3. LoginHistory is permanent in PostgreSQL, risk data in Redis (1h TTL)
4. Always run `npm run build` to verify TypeScript compilation
