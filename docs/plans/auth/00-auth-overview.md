# 00 — Auth Overview

## Context

Bu proje bir **Async Job Platform** — kullanıcılar API üzerinden uzun süren job'lar submit eder, RabbitMQ ile kuyruğa alınır, worker'lar tarafından işlenir. Auth modülü daha önce güvenlik öğrenme amaçlı aşırı mühendislik yapılmıştı (3D risk tracking, phone verification, login history vb.). Şimdi projenin gerçek amacına uygun şekilde sadeleştirilmesi gerekiyor.

**Hedef:** Auth modülünü job platform'a uygun hale getir — gereksizleri sil, basitleştir, API Keys ve TOTP 2FA ekle.

---

## KALACAKLAR (Keep)

| Dosya                        | Açıklama                                       |
| ---------------------------- | ---------------------------------------------- |
| `auth.controller.ts`         | login, register, refresh, logout, csrf, me     |
| `auth.service.ts`            | Core auth business logic (sadeleştirilecek)    |
| `session.service.ts`         | Redis session management (sadeleştirilecek)    |
| `token.service.ts`           | JWT access + refresh token                     |
| `register.dto.ts`            | Kayıt DTO'su (phone kaldırılacak)              |
| `login.dto.ts`               | Login DTO'su (fingerprint/device kaldırılacak) |
| `tokens-response.dto.ts`     | Token response + session DTO'ları              |
| `user.entity.ts`             | Temel kullanıcı entity (güncellenecek)         |
| `refresh-token.entity.ts`    | Token yönetimi entity                          |
| `jwt-auth.guard.ts`          | JWT koruması                                   |
| `local-auth.guard.ts`        | Local strategy guard                           |
| `roles.guard.ts`             | Role-based access control                      |
| `jwt.strategy.ts`            | JWT Passport strategy                          |
| `local.strategy.ts`          | Local Passport strategy                        |
| `user.repository.*`          | User repository                                |
| `refresh-token.repository.*` | Refresh token repository                       |
| Disposable email validator   | Yeni eklenen validator                         |
| Email normalization          | @Transform ile eklendi                         |

---

## SİLİNECEKLER (Delete — 16+ dosya)

### Services (6 dosya)

| Dosya                      | Neden                        |
| -------------------------- | ---------------------------- |
| `phone.service.ts`         | Phone verification gereksiz  |
| `login-history.service.ts` | Audit trail gereksiz         |
| `login-stats.service.ts`   | HyperLogLog stats gereksiz   |
| `risk-tracking.service.ts` | 3D risk tracking gereksiz    |
| `risk-scoring.service.ts`  | Risk scoring gereksiz        |
| `risk-monitor.service.ts`  | Cron job monitoring gereksiz |

### Controllers (2 dosya)

| Dosya                          | Neden                    |
| ------------------------------ | ------------------------ |
| `login-history.controller.ts`  | Login history gereksiz   |
| `risk-dashboard.controller.ts` | Admin dashboard gereksiz |

### DTOs (1 dosya)

| Dosya                 | Neden                       |
| --------------------- | --------------------------- |
| `phone-verify.dto.ts` | Phone verification gereksiz |

### Entities (3 dosya — libs/common)

| Dosya                          | Neden                            |
| ------------------------------ | -------------------------------- |
| `phone-verification.entity.ts` | Phone entity gereksiz            |
| `login-history.entity.ts`      | Login history entity gereksiz    |
| `login-history.enum.ts`        | Login history enum'ları gereksiz |

### Repositories (4 dosya — apps/auth/repositories)

| Dosya                                        | Neden                       |
| -------------------------------------------- | --------------------------- |
| `phone-verification.repository.interface.ts` | Phone repo gereksiz         |
| `phone-verification.repository.ts`           | Phone repo gereksiz         |
| `login-history.repository.interface.ts`      | Login history repo gereksiz |
| `login-history.repository.ts`                | Login history repo gereksiz |

---

## EKLENECEKLER (Add)

| Özellik                | Dosyalar                              | Detay                           |
| ---------------------- | ------------------------------------- | ------------------------------- |
| Register Rate Limiting | `guards/register-rate-limit.guard.ts` | IP tabanlı Redis guard, 5/saat  |
| API Keys               | Entity, repo, service, guard, DTOs    | Dış servisler için API key auth |
| TOTP 2FA               | Service, DTOs, login flow değişikliği | Google Authenticator ile 2FA    |

---

## Uygulama Sırası

```
Step 1 (01-auth-cleanup.md)        → Gereksiz dosyaları sil, referansları temizle
Step 2 (02-auth-simplify.md)       → DTO'ları ve servisleri sadeleştir
Step 3 (03-register-rate-limiting.md) → Register guard ekle
Step 4 (04-api-keys.md)            → API key sistemi
Step 5 (05-totp-2fa.md)            → 2FA sistemi
```

Her adımdan sonra `npm run build` ile doğrulama yapılacak.
