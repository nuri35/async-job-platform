# Step 02: Auth Simplify

## Scope

DTO'lardan gereksiz alanları kaldır, AuthService/SessionService'ten fingerprint/device/risk kodlarını çıkar, entity'leri güncelle. Sadece bu plandaki değişiklikleri yap.

## LoginDto (modules/auth/dto/login.dto.ts)

- `deviceFingerprint` alanını kaldır
- `deviceName` alanını kaldır
- Sadece email + password kalsın

## RegisterDto (modules/auth/dto/register.dto.ts)

- `phone` alanını kaldır
- Sadece email + password kalsın

## AuthService (modules/auth/services/auth.service.ts)

Constructor'dan kaldır:
- PhoneService inject (forwardRef dahil)
- LoginHistoryService inject
- RiskTrackingService inject

register() — kaldır:
- findByPhone() kontrolü
- phone ve phoneVerified ataması
- phoneService.sendVerificationCode() çağrısı
- Sadece email kontrolü + user oluşturma kalsın

login() — kaldır:
- deviceFingerprint/deviceName destructuring
- Fingerprint rate limiting logic
- Device blocking check
- Phone verification check
- Existing session check by fingerprint
- Device limit check
- LoginHistory kayıtları
- RiskTracking kayıtları
- Flow: find user → check isActive → verify password → generate tokens → save refresh token → create session → return

Tamamen sil:
- handleFailedLogin() metodu
- recordRiskAttempt() metodu
- maxDevices property

refresh() — deviceFingerprint/deviceName kullanımlarını kaldır
logout() / logoutAll() — fingerprint referanslarını kaldır
getSessions() / revokeSession() — fingerprint referanslarını kaldır

## SessionService (modules/auth/services/session.service.ts)

Kaldırılacak property'ler:
- DEVICE_ATTEMPT_PREFIX, DEVICE_BLOCK_PREFIX
- DEVICE_ATTEMPT_TTL, DEVICE_BLOCK_TTL
- MAX_DEVICE_ATTEMPTS, MAX_BLOCKS_BEFORE_DEACTIVATION

Kaldırılacak metodlar:
- getDeviceAttemptKey(), getDeviceBlockKey()
- getDeviceLoginAttempts(), incrementDeviceLoginAttempts(), resetDeviceLoginAttempts()
- getDeviceBlockCount(), incrementDeviceBlockCount(), resetDeviceBlockCount()
- isDeviceBlocked(), shouldDeactivateAccount()
- findSessionByFingerprint()

SessionData interface — kaldır:
- deviceFingerprint, deviceName
- Sadece ipAddress, userAgent, createdAt, lastActivity kalsın

## User Entity (libs/common/src/entities/user.entity.ts)

- `phone` kolonunu kaldır
- `phoneVerified` kolonunu kaldır
- 2FA alanları EKLEME — Step 5'e ait

## RefreshToken Entity (libs/common/src/entities/refresh-token.entity.ts)

- `deviceFingerprint` kolonunu kaldır
- `deviceName` kolonunu kaldır

## RefreshToken Repository

- `revokeByDeviceFingerprint()` metodu varsa kaldır

## UserRepository

- `findByPhone()` metodunu kaldır

## TokensResponseDto — SessionDto (modules/auth/dto/tokens-response.dto.ts)

- SessionDto'dan deviceFingerprint, deviceName kaldır
- userAgent ekle (string | null)

## auth.controller.ts

- register() response mesajını güncelle: SMS referansını kaldır, sadece "account created" mesajı
- Swagger açıklamalarından phone/device referanslarını kaldır

## Son

```bash
npm run build
```

Build 0 error olmalı.

## Dokunma

- Guard dosyaları
- Strategy dosyaları
- Rate limiting logic (SessionService'teki genel rate limit kalacak)
- Jobs modülü
- 2FA ile ilgili hiçbir şey (Step 5)