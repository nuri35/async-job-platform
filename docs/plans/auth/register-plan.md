# Step 02.5: Email Verification

## Why

Users can submit jobs (report generation, CSV import, webhook) that consume worker resources. Without email verification, anyone can create fake accounts and spam the job queue. Email verification is the gatekeeper before job submission.

## Scope

Add email verification flow to auth module. Only touch files listed here.

## User Entity (libs/common/src/entities/user.entity.ts)

Add:
- `isEmailVerified: boolean` — default false
- `emailVerificationToken: string | null` — UUID token
- `emailVerificationExpiresAt: Date | null` — token expiry (24h)

## New Files

### DTO
- `modules/auth/dto/verify-email.dto.ts` — single field: `token` (string, UUID)
- `modules/auth/dto/resend-verification.dto.ts` — single field: `email` (string, validated)

### Guard
- `modules/auth/guards/email-verified.guard.ts` — CanActivate, checks `user.isEmailVerified`. Apply to job submission endpoints.

### Decorator
- `modules/auth/decorators/require-email-verification.decorator.ts` — `@RequireEmailVerification()` shortcut for the guard

## Auth Controller (modules/auth/controllers/auth.controller.ts)

Add 2 endpoints:

```
POST /auth/verify-email        @Public()    — verify token from email link
POST /auth/resend-verification @Public()    — resend verification email
```

Both return generic success message regardless of outcome (enumeration protection).

## Auth Service (modules/auth/services/auth.service.ts)

Add methods:

`verifyEmail(token: string): Promise<void>`
- Find user by emailVerificationToken where expiresAt > now
- If not found, throw generic error (don't reveal if token is invalid or expired)
- Set isEmailVerified = true, clear token fields
- Save user

`resendVerificationEmail(email: string): Promise<void>`
- Find user by email
- If not found OR already verified, return silently (enumeration protection)
- Generate new UUID token, set new expiry (24h)
- Send verification email
- Rate limit: max 3 resends per email per hour (use SessionService rate limit)

`sendVerificationEmail(user: User): Promise<void>`
- Generate UUID token, set expiry
- Save to user entity
- Send email with verification link: `{FRONTEND_URL}/verify-email?token={token}`

## Register Flow Change

In `register()` after user creation:
- Call `sendVerificationEmail(user)`
- Response message stays generic (no change needed)

## Email Sending

Use a simple approach — don't overbuild:
- Create `modules/auth/services/email.service.ts`
- Use nodemailer with SMTP config from ConfigService
- Single method: `sendMail(to, subject, html)`
- For dev/staging: log email to console instead of sending (configurable via ENV)

ENV variables:
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`
- `SMTP_FROM` — sender address
- `EMAIL_ENABLED` — true/false, when false just log to console

## Job Submission Protection

In jobs controller (`modules/jobs/jobs.controller.ts`):
- Add `@RequireEmailVerification()` to `POST /jobs` endpoint
- Unverified users get 403: "Email verification required to submit jobs"

## Dependencies

```bash
npm install nodemailer
npm install -D @types/nodemailer
```

## Validation

```bash
npm run build
```

Build 0 error.

## Do NOT Touch

- Login/logout/refresh flows — no changes
- Session management
- Token service
- Jobs module (except adding guard to POST /jobs)
- Any plan Step 3-5 scope