# Async Job Platform - Claude Code Context

---

## Project Guidelines for Claude

### Clean Code (Always Apply)
- Meaningful, descriptive names (no `x`, `temp`, `data`)
- Functions: max 20-30 lines, single responsibility
- No code duplication (DRY principle)
- No magic strings/numbers → use constants/enums
- Early returns to avoid deep nesting
- Comments only for "WHY", not "WHAT"

### Error Handling (Always)
- Never ignore errors silently
- Use try-catch with specific error types
- Return meaningful error messages
- Log errors with context (where, what, why)

### Security (Always Check)
- Never trust user input → always validate
- No sensitive data in logs (passwords, tokens)
- Use environment variables for secrets
- SQL injection prevention (parameterized queries)
- XSS prevention for any user-displayed content

---

## Architecture Rules

### Before Writing Code, ALWAYS Ask:
1. "Where should this logic live?"
2. "Does similar functionality already exist?"
3. "Should this be a new module/file or extend existing?"
4. "What's the error handling strategy?"
5. "Do you want tests included?"

### Separation of Concerns
- Controllers/Routes → only HTTP handling
- Services → business logic
- Repositories/DAL → database operations
- Utils/Helpers → pure functions, no side effects

### Dependencies
- Before adding new package, ask: "Is this necessary?"
- Prefer well-maintained, popular packages
- Check for security vulnerabilities

---

## Code Review Checklist

When reviewing or writing code, check:
- [ ] Input validation exists
- [ ] Errors are handled properly
- [ ] No hardcoded values
- [ ] Function names describe what they do
- [ ] No unnecessary complexity
- [ ] Edge cases considered

---

## Git & Changes

- Suggest atomic, focused changes (one feature = one change)
- Don't modify unrelated code
- Preserve existing code style in the project
- Commit format: `feat(module):`, `fix(module):`, `style(module):`

---

## Communication Rules

- Be direct and concise
- Ask clarifying questions before implementing
- Show approach/structure first, then full code
- Production-ready code only
- Turkish explanations are welcome
- Don't explain basics I already know
- When fixing bugs: explain root cause, not just the fix

---

## Response Format Preferences

**For new features:**
1. First: Ask architecture questions
2. Then: Show file structure / approach
3. Finally: Provide implementation

**For bug fixes:**
1. First: Identify root cause
2. Then: Explain why it happens
3. Finally: Show fix with explanation

**For code review:**
- 🔴 Critical (must fix)
- 🟡 Warning (should fix)
- 🟢 Suggestion (nice to have)

---

## NestJS & TypeORM Conventions

- Business logic in Services, never in Controllers
- DTOs with class-validator for all inputs
- Repository pattern for database operations
- Custom exceptions with proper HTTP codes
- Guards for authentication/authorization
- Interceptors for response transformation
- One service per responsibility
- Inject dependencies through constructor
- Use `@Injectable()` for services
- Use `@Cron()` for scheduled tasks with `isRunning` flag to prevent overlap

### Common Terms

| Term | Description |
|------|-------------|
| DTO | Data Transfer Object |
| Entity | Database model (TypeORM) |
| Repository | Data access layer |
| Guard | Auth middleware |
| Interceptor | Request/Response transformer |
| Pipe | Validation/Transformation |
| Module | Feature boundary |

---

## Project Overview

**NestJS monorepo** for async job processing with comprehensive auth and security monitoring.

### Tech Stack
- **Framework:** NestJS (Node.js)
- **Language:** TypeScript
- **Database:** PostgreSQL (TypeORM)
- **Cache/Queue:** Redis (ioredis)
- **Authentication:** JWT (access + refresh tokens)
- **API Docs:** Swagger/OpenAPI

### Project Structure

```
async-job-platform/
├── apps/
│   └── async-job-platform/
│       └── src/
│           └── modules/
│               └── auth/
│                   ├── controllers/
│                   ├── services/
│                   ├── guards/
│                   ├── decorators/
│                   └── dto/
├── libs/
│   └── common/
│       └── src/
│           ├── entities/
│           └── repositories/
└── CLAUDE.md
```

---

## Auth Module - Components

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
| Controller | Endpoints |
|------------|-----------|
| `AuthController` | /auth/* |
| `LoginHistoryController` | /login-history/* |
| `RiskDashboardController` | /risk-dashboard/* (Admin) |

---

## Security Features

### Rate Limiting
- Device fingerprint: 20 attempts / 15 minutes
- Per email-device: 5 failed = 1 hour block
- 3 blocks = account deactivation

### Risk Monitoring (3-Dimensional)

**IP Tracking:**
- `risk:attempts` - Sorted set (sliding window)
- `risk:active` - Active IPs
- `risk:ip:{ip}:targets` - Target emails

**Fingerprint Tracking (VPN Detection):**
- `risk:fp:active` - Active fingerprints
- `risk:fp:{fp}:ips` - IPs used by fingerprint
- `risk:fp:{fp}:targets` - Target emails

**Email Tracking (Victim Protection):**
- `risk:email:active` - Emails under attack
- `risk:email:{email}:ips` - Attacker IPs
- `risk:email:{email}:fingerprints` - Attacker fingerprints

### Attack Detection

| Attack Type | Detection |
|-------------|-----------|
| BRUTE_FORCE | 1 IP → 1 Email (many attempts) |
| CREDENTIAL_STUFFING | 1 IP → Many Emails |
| VPN_ROTATION | 1 Fingerprint → Many IPs |
| DISTRIBUTED_ATTACK | Many IPs → 1 Email |
| BOTNET | Many IPs + Many FPs → 1 Email |

### Risk Scoring

```
IP:          failedScore(max 50) + targetScore(max 45)
Fingerprint: failedScore(max 50) + ipRotationScore(max 60) + targetScore(max 45)
Email:       failedScore(max 30) + attackerIpScore(max 50) + attackerFpScore(max 45)

Levels: LOW (<25), MEDIUM (25-49), HIGH (>=50)
```

---

## Redis Best Practices

- Use `pipeline()` for multiple operations
- Always set TTL with `expire()`
- Data structures:
  - SORTED SET → time-based queries (sliding window)
  - SET → unique collections
  - HASH → key-value pairs
  - HYPERLOGLOG → approximate unique counts

---

## Commands

```bash
npm run start:dev   # Development
npm run build       # Build
npm run test        # Test
npm run lint        # Lint
```

---

## Notes for Claude

1. **DO NOT** break or modify existing working code without explicit request
2. When modifying risk tracking, update all 3 dimensions (IP, FP, Email)
3. CronJob runs every 30 seconds - be mindful of performance
4. Redis keys have 1-hour TTL for risk data
5. LoginHistory is permanent in PostgreSQL
6. Always run `npm run build` to verify TypeScript compilation
7. Ask before implementing - architecture decisions need confirmation
