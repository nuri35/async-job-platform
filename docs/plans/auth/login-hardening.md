# Step 02.8: Login Hardening

## Scope

Login endpoint'e güvenlik iyileştirmeleri ekle: enumeration fix, email verification kontrolü. Audit log ayrı planda (login-audit-log.md).

---

## 1. isActive Enumeration Fix

`modules/auth/services/auth.service.ts` → `login()` metodu

```typescript
// ÖNCE (farklı mesaj — email var mı belli oluyor):
if (!user.isActive) {
  throw new UnauthorizedException('Account is disabled. Please contact support.');
}

// SONRA (aynı mesaj — enumeration koruması):
if (!user.isActive) {
  this.logger.debug(`Login attempt on disabled account: ${dto.email}`);
  throw new UnauthorizedException('Invalid credentials');
}
```

Tek satır değişiklik + debug log.

---

## 2. Email Verification Check

`modules/auth/services/auth.service.ts` → `login()` metodu

isActive check'inden sonra, bcrypt'ten önce ekle:

```typescript
// isActive check'inden sonra:
if (!user.isEmailVerified) {
  this.logger.debug(`Login attempt with unverified email: ${dto.email}`);
  throw new UnauthorizedException('Invalid credentials');
}
```

Aynı mesaj — doğrulanmamış email olduğu belli olmamalı.

### Neden?

Job platform'da doğrulanmamış email ile login olunursa:
- Job oluşturabilir (CSV import, webhook trigger)
- Sahte email ile sisteme erişim sağlanır
- Bildirim email'leri yanlış adrese gider

### Login Flow (güncellenmiş sıra)

```
1. Find user → yoksa: "Invalid credentials"
2. isActive check → değilse: "Invalid credentials"
3. isEmailVerified check → değilse: "Invalid credentials"  ← YENİ
4. bcrypt compare → yanlışsa: "Invalid credentials"
5. Token üret + session oluştur
```

Tüm rejection'lar aynı mesaj — saldırgan hangi adımda fail olduğunu bilemez.

---

## Validation

```bash
npm run build
```

Build 0 error olmalı.

## Kontrol Listesi

- [ ] isActive mesajını "Invalid credentials" yap + debug log ekle
- [ ] isEmailVerified check ekle (bcrypt'ten önce)
- [ ] Barrel export'ları güncelle (gerekiyorsa)
- [ ] npm run build — 0 error

## Do NOT Touch

- Register flow
- Refresh/logout/session endpoints
- Token service
- Rate limiting (ayrı plan)
- Audit log (ayrı plan: login-audit-log.md)
- Jobs module
- Worker app