# Step 02.3: Logout Fix

## Scope

logout() tüm refresh token'ları revoke ediyor, sadece mevcut session'ınkini revoke etmeli. RefreshToken entity'ye jti ekle, logout'u düzelt.

## Problem

logout() → revokeAllByUserId() çağırıyor → tüm cihazlardaki session'lar ölüyor.
logoutAll() da aynısını yapıyor → ikisi arasında fark yok.

## RefreshToken Entity (libs/common/src/entities/refresh-token.entity.ts)

Add:
- `jti: string` — `@Column()`, `@Index()` — session ile eşleştirme için

## RefreshToken Repository

### Interface (modules/auth/repositories/refresh-token.repository.interface.ts)

Add method:
- `revokeByJti(jti: string): Promise<void>`

### Implementation (modules/auth/repositories/refresh-token.repository.ts)

Add method:
- `revokeByJti(jti: string)` → find by jti where revokedAt is null, set revokedAt = now

## AuthService (modules/auth/services/auth.service.ts)

### login()

Refresh token save ederken jti'yi ekle:
- `refreshTokenEntity.jti = jti` (generateAccessToken'dan dönen jti)

### logout(userId, jti)

Değiştir:
- `revokeAllByUserId(userId)` → `revokeByJti(jti)`

### logoutAll(userId)

Değişiklik yok — zaten doğru, revokeAllByUserId kalacak.

## Validation

```bash
npm run build
```

Build 0 error olmalı.

## Do NOT Touch

- logoutAll — zaten doğru çalışıyor
- Token service
- Session service
- Login flow (rate limiting hariç)
- Register flow