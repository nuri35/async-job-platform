# Step 02.8: Refresh Token Security

## Scope

İki fix: refresh token reuse detection (çalıntı token tespiti) ve revokeSession'a refresh token revoke ekleme. Sadece bu plandaki dosyalarla çalış.

## Problem 1: Reuse Detection Yok

Revoke edilmiş refresh token kullanıldığında sadece hata dönüyor. Saldırgan çalıntı token ile refresh yapmışsa, eski token revoke oluyor ama saldırgan yeni token'la içeride kalıyor. Gerçek kullanıcı eski token'ı denediğinde "not found" alıyor, saldırı fark edilmiyor.

## Problem 2: revokeSession Refresh Token'ı Revoke Etmiyor

Session siliniyor, access token blacklist ediliyor ama refresh token DB'de hâlâ geçerli. O cihaz refresh yaparak geri dönebilir.

## RefreshToken Repository

### Interface (modules/auth/repositories/refresh-token.repository.interface.ts)

Change `findByTokenHash`:
- Revoke filtresi OLMADAN arasın (WHERE revoked_at IS NULL koşulunu kaldır)
- Revoke edilmiş token'lar da dönsün ki service katmanında kontrol edebilelim

### Implementation (modules/auth/repositories/refresh-token.repository.ts)

- `findByTokenHash(hash)` → `WHERE token_hash = $1` (revoke filtresi yok)

## AuthService.refresh() Değişikliği (modules/auth/services/auth.service.ts)

Mevcut flow'dan sonra, findByTokenHash sonrası logic değişiyor:

```
tokenHash ile DB'den ara (filtre yok)
  → Token bulunamadı → UnauthorizedException('Invalid refresh token')
  → Token bulundu + revokedAt dolu → SALDIRI:
      1. revokeAllByUserId(userId)
      2. getAllSessions(userId) → tüm jti'leri al
      3. blacklistMultipleTokens(jtis)
      4. deleteAllSessions(userId)
      5. throw UnauthorizedException('Invalid refresh token')
  → Token bulundu + revokedAt null → normal akışa devam
```

Response mesajı her durumda aynı: 'Invalid refresh token' — saldırgana ekstra bilgi verme.

Yeni refresh token save ederken jti ekle:
- `newRefreshTokenEntity.jti = jti`

## AuthService.revokeSession() Değişikliği

Mevcut:
- blacklistToken(sessionId)
- deleteSession(userId, sessionId)

Ekle:
- refreshTokenRepository.revokeByJti(sessionId) — session'ın refresh token'ını da öldür

Sıralama:
1. blacklistToken(sessionId)
2. revokeByJti(sessionId)
3. deleteSession(userId, sessionId)

## getSessions

Değişiklik yok — doğru çalışıyor.

## Validation

```bash
npm run build
```

Build 0 error olmalı.

## Do NOT Touch

- Login flow
- Register flow
- Logout / logoutAll (Step 02.3'te düzeltildi)
- Token service
- Session service
- Rate limiting