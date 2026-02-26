# 02 — Auth Simplify (Login Flow Sadeleştirme)

## Amaç

Cleanup sonrası kalan dosyaları sadeleştir: DTO'lardan gereksiz alanları kaldır, AuthService'ten fingerprint/device/risk tracking kodlarını çıkar, SessionService'i basitleştir, User entity'yi güncelle.

---

## LoginDto Sadeleştirme

### Önce (şu anki hali):

```typescript
// apps/async-job-platform/src/modules/auth/dto/login.dto.ts
export class LoginDto {
  @ApiProperty({ example: 'user@example.com' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Password123' })
  @IsString()
  @IsNotEmpty()
  password: string;

  @ApiProperty({
    example: 'd4e5f6a7b8c9',
    description: 'Device fingerprint for session tracking',
  })
  @IsString()
  @IsNotEmpty()
  deviceFingerprint: string; // KALDIRILACAK

  @ApiProperty({
    example: 'Chrome - Windows',
    description: 'Human readable device name',
  })
  @IsString()
  @IsNotEmpty()
  deviceName: string; // KALDIRILACAK
}
```

### Sonra:

```typescript
export class LoginDto {
  @ApiProperty({ example: 'user@example.com' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Password123' })
  @IsString()
  @IsNotEmpty()
  password: string;
}
```

---

## RegisterDto Sadeleştirme

### Önce:

```typescript
// apps/async-job-platform/src/modules/auth/dto/register.dto.ts
export class RegisterDto {
  @ApiProperty({ example: 'user@example.com' })
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @IsEmail()
  @IsNotDisposableEmail()
  email: string;

  @ApiProperty({ example: 'Password123' })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(50)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, { ... })
  password: string;

  @ApiProperty({ example: '+905551234567' })
  @IsNotEmpty({ message: 'Phone number is required' })
  @IsString()
  @Matches(/^\+[1-9]\d{10,14}$/, { ... })
  phone: string;  // KALDIRILACAK
}
```

### Sonra:

```typescript
export class RegisterDto {
  @ApiProperty({ example: 'user@example.com' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @IsNotDisposableEmail()
  email: string;

  @ApiProperty({ example: 'Password123' })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(50)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, {
    message:
      'Password must contain at least one uppercase letter, one lowercase letter, and one number',
  })
  password: string;
}
```

---

## AuthService Sadeleştirme

### Constructor — Kaldırılacak dependency'ler:

```typescript
// ÖNCE:
constructor(
  private readonly configService: ConfigService,
  private readonly userRepository: IUserRepository,
  private readonly refreshTokenRepository: IRefreshTokenRepository,
  private readonly tokenService: TokenService,
  private readonly sessionService: SessionService,
  @Inject(forwardRef(() => PhoneService))
  private readonly phoneService: PhoneService,           // KALDIR
  private readonly loginHistoryService: LoginHistoryService,  // KALDIR
  private readonly riskTrackingService: RiskTrackingService,  // KALDIR
)

// SONRA:
constructor(
  private readonly configService: ConfigService,
  private readonly userRepository: IUserRepository,
  private readonly refreshTokenRepository: IRefreshTokenRepository,
  private readonly tokenService: TokenService,
  private readonly sessionService: SessionService,
)
```

### register() — Sadeleştirme:

```typescript
// ÖNCE: phone kontrolü + SMS gönderimi var
// SONRA: sadece email kontrolü + user oluşturma

async register(dto: RegisterDto): Promise<User | null> {
  const existingEmail = await this.userRepository.findByEmail(dto.email);
  if (existingEmail) {
    this.logger.debug(`Registration attempt with existing email: ${dto.email}`);
    return null;
  }

  const passwordHash = await bcrypt.hash(dto.password, 12);

  const user = this.userRepository.create({
    email: dto.email,
    passwordHash,
  });

  return this.userRepository.save(user);
}
```

Kaldırılacaklar:

- `findByPhone()` kontrolü
- `phone: dto.phone` ve `phoneVerified: false` ataması
- `phoneService.sendVerificationCode()` çağrısı

### login() — Büyük Sadeleştirme:

Mevcut login flow çok karmaşık (fingerprint rate limit, device blocking, login history, risk tracking). Sadeleştirilmiş hali:

```typescript
async login(
  dto: LoginDto,
  ipAddress: string | null,
  userAgent: string | null,
): Promise<TokensResponseDto & { refreshToken: string }> {
  const { email } = dto;

  // 1. Find user
  const user = await this.userRepository.findByEmail(email);
  if (!user) {
    throw new UnauthorizedException('Invalid credentials');
  }

  // 2. Check if user is active
  if (!user.isActive) {
    throw new UnauthorizedException('Account is disabled. Please contact support.');
  }

  // 3. Verify password
  const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
  if (!isPasswordValid) {
    throw new UnauthorizedException('Invalid credentials');
  }

  // 4. Generate tokens
  const { token: accessToken, jti } = await this.tokenService.generateAccessToken(user);
  const refreshTokenData = await this.tokenService.generateRefreshToken(user.id);

  // 5. Save refresh token to DB
  const refreshTokenEntity = this.refreshTokenRepository.create({
    tokenHash: refreshTokenData.hash,
    userId: user.id,
    userAgent,
    ipAddress,
    expiresAt: refreshTokenData.expiresAt,
  });
  await this.refreshTokenRepository.save(refreshTokenEntity);

  // 6. Create session in Redis
  await this.sessionService.createSession(user.id, jti, {
    ipAddress,
    userAgent,
  });

  return {
    accessToken,
    expiresIn: this.tokenService.getAccessTokenExpiresIn(),
    tokenType: 'Bearer',
    refreshToken: refreshTokenData.token,
  };
}
```

Kaldırılacaklar:

- `deviceFingerprint` / `deviceName` destructuring
- Fingerprint rate limiting (step 1 eski)
- Device blocking check (step 2 eski)
- Phone verification check (step 6 eski)
- Existing session check by fingerprint (step 7 eski)
- Device limit check
- LoginHistory kayıtları
- RiskTracking kayıtları
- `handleFailedLogin()` metodu tamamen silinecek
- `recordRiskAttempt()` private metodu tamamen silinecek
- `maxDevices` property'si kaldırılacak

### refresh() — Küçük Güncelleme:

```typescript
// Kaldırılacak: deviceFingerprint ve deviceName kullanımları
// RefreshToken entity'den bu alanlar kaldırılınca otomatik temizlenecek
```

### logout() / logoutAll() — Fingerprint referansları temizlenecek

### getSessions() / revokeSession() — Fingerprint referansları temizlenecek

---

## SessionService Sadeleştirme

### Kaldırılacak metodlar ve property'ler:

```typescript
// Property'ler — KALDIR:
(DEVICE_ATTEMPT_PREFIX, DEVICE_BLOCK_PREFIX);
(DEVICE_ATTEMPT_TTL, DEVICE_BLOCK_TTL);
(MAX_DEVICE_ATTEMPTS, MAX_BLOCKS_BEFORE_DEACTIVATION);

// Metodlar — KALDIR:
getDeviceAttemptKey();
getDeviceBlockKey();
getDeviceLoginAttempts();
incrementDeviceLoginAttempts();
resetDeviceLoginAttempts();
getDeviceBlockCount();
incrementDeviceBlockCount();
resetDeviceBlockCount();
isDeviceBlocked();
shouldDeactivateAccount();
findSessionByFingerprint();
```

### SessionData interface güncelleme:

```typescript
// ÖNCE:
interface SessionData {
  deviceFingerprint: string;
  deviceName: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  lastActivity: string;
}

// SONRA:
interface SessionData {
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  lastActivity: string;
}
```

### Kalacak metodlar:

- `createSession()` — sessionData'dan fingerprint/device kaldırılacak
- `getSession()`
- `getAllSessions()`
- `countSessions()`
- `deleteSession()`
- `deleteAllSessions()`
- `updateLastActivity()`
- `blacklistToken()` / `isTokenBlacklisted()` / `blacklistMultipleTokens()`
- `incrementRateLimit()` / `getRateLimitCount()` / `resetRateLimit()` — genel rate limit, kalacak

---

## User Entity Güncelleme

### Önce:

```typescript
@Column({ type: 'varchar', length: 20, unique: true, nullable: true })
@Index()
phone: string | null;

@Column({ default: false })
phoneVerified: boolean;
```

### Sonra (phone ve phoneVerified kaldır, 2FA alanları ekle):

```typescript
// phone ve phoneVerified KALDIRILDI

// 2FA için yeni alanlar (05-totp-2fa adımında kullanılacak):
@Column({ nullable: true })
twoFactorSecret: string;

@Column({ default: false })
isTwoFactorEnabled: boolean;

@Column('simple-array', { nullable: true })
recoveryCodes: string[];
```

> Not: 2FA alanlarının eklenmesi bu adımda yapılabilir (entity hazırlığı) veya Step 5'e bırakılabilir. Tercih: bu adımda ekle, böylece entity tek seferde güncellenir.

---

## RefreshToken Entity Güncelleme

### Kaldırılacak alanlar:

```typescript
@Column()
deviceFingerprint: string;  // KALDIR

@Column()
deviceName: string;  // KALDIR
```

### RefreshToken Repository güncelleme:

`revokeByDeviceFingerprint()` metodu varsa kaldırılacak — artık fingerprint yok.

---

## TokensResponse DTO Güncelleme

### SessionDto — fingerprint/device kaldır:

```typescript
// ÖNCE:
export class SessionDto {
  id: string;
  deviceFingerprint: string; // KALDIR
  deviceName: string; // KALDIR
  ipAddress: string | null;
  createdAt: Date;
  current: boolean;
}

// SONRA:
export class SessionDto {
  id: string;
  ipAddress: string | null;
  userAgent: string | null; // EKLE (device yerine)
  createdAt: Date;
  current: boolean;
}
```

---

## auth.controller.ts Güncelleme

### register() response mesajı:

```typescript
// ÖNCE:
return {
  message:
    'If your email and phone are not already registered, a verification SMS has been sent.',
};

// SONRA:
return {
  message:
    'If your email is not already registered, your account has been created.',
};
```

### login() — Swagger açıklamalarından phone/device referanslarını kaldır

### UserRepository — `findByPhone()` metodu kaldırılacak

---

## Doğrulama

```bash
npm run build
```

- Build başarılı olmalı
- Login/register basit email+password ile çalışmalı
- Session yönetimi fingerprint olmadan çalışmalı

---

## Kontrol Listesi

- [ ] `LoginDto` — deviceFingerprint ve deviceName kaldır
- [ ] `RegisterDto` — phone kaldır
- [ ] `AuthService.register()` — phone logic kaldır
- [ ] `AuthService.login()` — fingerprint/device/risk/history logic kaldır
- [ ] `AuthService` — handleFailedLogin() ve recordRiskAttempt() sil
- [ ] `AuthService` — constructor'dan PhoneService, LoginHistoryService, RiskTrackingService kaldır
- [ ] `SessionService` — device-based metodları ve property'leri kaldır
- [ ] `SessionService` — SessionData interface güncelle
- [ ] `User` entity — phone, phoneVerified kaldır; 2FA alanları ekle
- [ ] `RefreshToken` entity — deviceFingerprint, deviceName kaldır
- [ ] `RefreshToken` repository — fingerprint metodu kaldır
- [ ] `TokensResponseDto` — SessionDto güncelle
- [ ] `auth.controller.ts` — register response mesajı güncelle
- [ ] `UserRepository` — findByPhone() kaldır
- [ ] `npm run build` — başarılı
