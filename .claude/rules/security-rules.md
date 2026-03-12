# Security Rules

## Enumeration Protection

Tüm auth endpoint'lerde (login, register, verify, resend) failure response aynı olmalı. Saldırgan hangi adımda fail olduğunu ayırt edememeli.

- User not found → "Invalid credentials"
- Account disabled → "Invalid credentials"
- Email not verified → "Invalid credentials"
- Wrong password → "Invalid credentials"
- Rate limited → 429 (Retry-After header ile)
- Account locked → 429 (aynı format)

Yeni auth endpoint eklerken bu pattern'i koru. Farklı hata mesajı DÖNME.

## Password Handling

- bcrypt ile hash, salt round: 12
- Plaintext password asla log'lanmaz
- Password karşılaştırması her durumda yapılır (timing attack önleme)

## Token Security

- Access token: response body (kısa ömürlü)
- Refresh token: HttpOnly cookie (uzun ömürlü)
- Blacklisted token: Redis'te `blacklist:jwt:{jti}` key ile kontrol
- Token rotation: her refresh'te yeni token pair üret, eskiyi blacklist'e al

## Rate Limiting Strategy

- Register: fixed window (INCR + EXPIRE) — basit, yeterli
- Login: sliding window (Redis sorted set + Lua script) — brute force'a karşı güçlü
- Yeni rate limit eklerken: endpoint hassasiyetine göre fixed veya sliding window seç

## Audit Trail

- Login denemeleri (başarılı/başarısız) kayıt altına alınır
- failReason enum ile ayrıştırılır: USER_NOT_FOUND, ACCOUNT_DISABLED, EMAIL_NOT_VERIFIED, INVALID_PASSWORD
- Async — RabbitMQ üzerinden, login response'u bloklamaz