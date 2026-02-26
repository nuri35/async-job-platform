# 05 — TOTP 2FA (Two-Factor Authentication)

## Amaç

Google Authenticator / Authy ile iki faktörlü doğrulama. Login flow iki aşamalı olur: 2FA aktifse önce partial token, sonra TOTP ile tam token.

---

## npm Paketleri

```bash
npm install otplib qrcode
npm install -D @types/qrcode
```

---

## User Entity Değişiklikleri

> Not: Bu alanlar Step 2'de eklenmiş olabilir. Eğer eklenmemişse burada eklenir.

```typescript
// libs/common/src/entities/user.entity.ts — eklenmesi gereken alanlar:

@Column({ nullable: true })
twoFactorSecret: string;

@Column({ default: false })
isTwoFactorEnabled: boolean;

@Column('simple-array', { nullable: true })
recoveryCodes: string[];
```

---

## Yeni Dosyalar

### 1. Service: `apps/async-job-platform/src/modules/auth/services/totp.service.ts`

```typescript
import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { authenticator } from 'otplib';
import * as QRCode from 'qrcode';
import { randomBytes } from 'crypto';
import { IUserRepository } from '../repositories';

@Injectable()
export class TotpService {
  private readonly APP_NAME = 'AsyncJobPlatform';

  constructor(private readonly userRepository: IUserRepository) {}

  /**
   * 2FA kurulumu başlat — secret ve QR code üret
   */
  async generateSecret(userId: string): Promise<{
    secret: string;
    qrCodeUrl: string;
  }> {
    const user = await this.userRepository.findById(userId);
    if (!user) throw new BadRequestException('User not found');

    if (user.isTwoFactorEnabled) {
      throw new BadRequestException(
        '2FA is already enabled. Disable it first.',
      );
    }

    // Generate TOTP secret
    const secret = authenticator.generateSecret();

    // Save secret (not enabled yet — user must verify first)
    user.twoFactorSecret = secret;
    await this.userRepository.save(user);

    // Generate QR code
    const otpAuthUrl = authenticator.keyuri(user.email, this.APP_NAME, secret);
    const qrCodeUrl = await QRCode.toDataURL(otpAuthUrl);

    return { secret, qrCodeUrl };
  }

  /**
   * TOTP token doğrula ve 2FA'yı aktifleştir
   */
  async verifyAndEnable(
    userId: string,
    token: string,
  ): Promise<{
    recoveryCodes: string[];
  }> {
    const user = await this.userRepository.findById(userId);
    if (!user || !user.twoFactorSecret) {
      throw new BadRequestException(
        '2FA setup not started. Call /auth/2fa/setup first.',
      );
    }

    if (user.isTwoFactorEnabled) {
      throw new BadRequestException('2FA is already enabled.');
    }

    // Verify TOTP token
    const isValid = authenticator.verify({
      token,
      secret: user.twoFactorSecret,
    });

    if (!isValid) {
      throw new UnauthorizedException('Invalid TOTP token');
    }

    // Generate recovery codes
    const recoveryCodes = this.generateRecoveryCodes();

    // Enable 2FA
    user.isTwoFactorEnabled = true;
    user.recoveryCodes = recoveryCodes;
    await this.userRepository.save(user);

    return { recoveryCodes };
  }

  /**
   * TOTP token doğrula (login sırasında)
   */
  async verifyToken(userId: string, token: string): Promise<boolean> {
    const user = await this.userRepository.findById(userId);
    if (!user || !user.isTwoFactorEnabled || !user.twoFactorSecret) {
      return false;
    }

    return authenticator.verify({
      token,
      secret: user.twoFactorSecret,
    });
  }

  /**
   * Recovery code ile doğrula (login sırasında — TOTP yerine)
   */
  async verifyRecoveryCode(userId: string, code: string): Promise<boolean> {
    const user = await this.userRepository.findById(userId);
    if (!user || !user.isTwoFactorEnabled || !user.recoveryCodes) {
      return false;
    }

    const index = user.recoveryCodes.indexOf(code);
    if (index === -1) return false;

    // Tek kullanımlık — kullanıldıktan sonra sil
    user.recoveryCodes.splice(index, 1);
    await this.userRepository.save(user);

    return true;
  }

  /**
   * 2FA devre dışı bırak (TOTP token ile doğrulama gerekir)
   */
  async disable(userId: string, token: string): Promise<void> {
    const user = await this.userRepository.findById(userId);
    if (!user || !user.isTwoFactorEnabled) {
      throw new BadRequestException('2FA is not enabled');
    }

    const isValid = authenticator.verify({
      token,
      secret: user.twoFactorSecret,
    });

    if (!isValid) {
      throw new UnauthorizedException('Invalid TOTP token');
    }

    user.twoFactorSecret = null;
    user.isTwoFactorEnabled = false;
    user.recoveryCodes = null;
    await this.userRepository.save(user);
  }

  /**
   * 8 adet recovery code üret (her biri 8 karakter hex)
   */
  private generateRecoveryCodes(): string[] {
    return Array.from({ length: 8 }, () => randomBytes(4).toString('hex'));
  }
}
```

---

### 2. DTOs: `apps/async-job-platform/src/modules/auth/dto/totp.dto.ts`

```typescript
import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, Length } from 'class-validator';

export class EnableTotpDto {
  @ApiProperty({ example: '123456', description: '6 haneli TOTP kodu' })
  @IsString()
  @IsNotEmpty()
  @Length(6, 6, { message: 'TOTP token must be exactly 6 digits' })
  token: string;
}

export class VerifyTotpDto {
  @ApiProperty({
    example: '123456',
    description: '6 haneli TOTP kodu veya recovery code',
  })
  @IsString()
  @IsNotEmpty()
  token: string;
}

export class TotpSetupResponseDto {
  @ApiProperty({
    example: 'JBSWY3DPEHPK3PXP',
    description: 'TOTP secret (manual entry için)',
  })
  secret: string;

  @ApiProperty({ description: 'QR code as data URL (base64 PNG)' })
  qrCodeUrl: string;
}

export class TotpEnabledResponseDto {
  @ApiProperty({
    example: ['a1b2c3d4', 'e5f6a7b8', '...'],
    description: 'Recovery codes — bunları güvenli bir yere kaydedin!',
  })
  recoveryCodes: string[];
}
```

---

## Login Flow Değişikliği

### Mevcut (Step 2 sonrası):

```
POST /auth/login → email + password → access token + refresh token
```

### Yeni (2FA aktifse):

```
POST /auth/login → email + password →
  - 2FA kapalı: normal token döner
  - 2FA açık: { requiresTwoFactor: true, partialToken: "..." } döner

POST /auth/login/2fa → partialToken + TOTP token → access token + refresh token
```

### AuthService.login() Güncelleme:

```typescript
async login(dto: LoginDto, ipAddress: string | null, userAgent: string | null) {
  // ... mevcut email + password doğrulama (Step 2'deki hali)

  // Password doğrulandıktan SONRA, token üretmeden ÖNCE:
  if (user.isTwoFactorEnabled) {
    // Partial token üret — kısa ömürlü (5 dakika), sadece 2FA adımı için
    const partialToken = await this.tokenService.generatePartialToken(user);
    return {
      requiresTwoFactor: true,
      partialToken,
    };
  }

  // 2FA kapalıysa normal flow devam eder...
}
```

### Yeni Metod — AuthService.verifyTwoFactor():

```typescript
async verifyTwoFactor(
  partialToken: string,
  totpToken: string,
  ipAddress: string | null,
  userAgent: string | null,
): Promise<TokensResponseDto & { refreshToken: string }> {
  // 1. Verify partial token
  const payload = await this.tokenService.verifyPartialToken(partialToken);
  if (!payload) {
    throw new UnauthorizedException('Invalid or expired partial token');
  }

  // 2. Get user
  const user = await this.userRepository.findById(payload.sub);
  if (!user || !user.isActive) {
    throw new UnauthorizedException('User not found or disabled');
  }

  // 3. Try TOTP token first, then recovery code
  let isValid = await this.totpService.verifyToken(user.id, totpToken);
  if (!isValid) {
    isValid = await this.totpService.verifyRecoveryCode(user.id, totpToken);
  }

  if (!isValid) {
    throw new UnauthorizedException('Invalid 2FA token');
  }

  // 4. Generate real tokens (same as normal login)
  const { token: accessToken, jti } = await this.tokenService.generateAccessToken(user);
  const refreshTokenData = await this.tokenService.generateRefreshToken(user.id);

  // 5. Save refresh token & create session
  // ... (normal login flow'un devamı)

  return { accessToken, expiresIn, tokenType: 'Bearer', refreshToken };
}
```

### TokenService — Yeni Metod:

```typescript
// Partial token — 5 dakika ömürlü, sadece userId + type: 'partial' içerir
async generatePartialToken(user: User): Promise<string> {
  return this.jwtService.sign(
    { sub: user.id, type: '2fa-partial' },
    { expiresIn: '5m' },
  );
}

async verifyPartialToken(token: string): Promise<{ sub: string } | null> {
  try {
    const payload = this.jwtService.verify(token);
    if (payload.type !== '2fa-partial') return null;
    return { sub: payload.sub };
  } catch {
    return null;
  }
}
```

---

## Endpoints (AuthController'a eklenir)

```typescript
// POST /auth/2fa/setup — QR code + secret al
@UseGuards(JwtAuthGuard)
@Post('2fa/setup')
@ApiBearerAuth()
@ApiOperation({ summary: 'Start 2FA setup — get QR code and secret' })
@ApiResponse({ status: 200, type: TotpSetupResponseDto })
async setupTwoFactor(
  @CurrentUser('sub') userId: string,
): Promise<TotpSetupResponseDto> {
  return this.totpService.generateSecret(userId);
}

// POST /auth/2fa/enable — TOTP token ile aktifleştir
@UseGuards(JwtAuthGuard)
@Post('2fa/enable')
@ApiBearerAuth()
@ApiOperation({ summary: 'Enable 2FA by verifying TOTP token' })
@ApiResponse({ status: 200, type: TotpEnabledResponseDto })
async enableTwoFactor(
  @CurrentUser('sub') userId: string,
  @Body() dto: EnableTotpDto,
): Promise<TotpEnabledResponseDto> {
  return this.totpService.verifyAndEnable(userId, dto.token);
}

// POST /auth/2fa/disable — TOTP token ile devre dışı bırak
@UseGuards(JwtAuthGuard)
@Post('2fa/disable')
@HttpCode(HttpStatus.NO_CONTENT)
@ApiBearerAuth()
@ApiOperation({ summary: 'Disable 2FA (requires valid TOTP token)' })
async disableTwoFactor(
  @CurrentUser('sub') userId: string,
  @Body() dto: EnableTotpDto,
): Promise<void> {
  await this.totpService.disable(userId, dto.token);
}

// POST /auth/login/2fa — 2FA ile login tamamla
@Public()
@Post('login/2fa')
@HttpCode(HttpStatus.OK)
@ApiOperation({ summary: 'Complete login with 2FA token' })
@ApiBody({
  schema: {
    properties: {
      partialToken: { type: 'string' },
      token: { type: 'string', description: 'TOTP token or recovery code' },
    },
  },
})
@ApiResponse({ status: 200, type: TokensResponseDto })
@ApiResponse({ status: 401, description: 'Invalid partial token or 2FA token' })
async loginTwoFactor(
  @Body() body: { partialToken: string; token: string },
  @Req() req: FastifyRequest,
  @Res({ passthrough: true }) res: FastifyReply,
) {
  const ipAddress = req.ip || req.headers['x-forwarded-for']?.toString() || null;
  const userAgent = req.headers['user-agent'] || null;

  const result = await this.authService.verifyTwoFactor(
    body.partialToken,
    body.token,
    ipAddress,
    userAgent,
  );

  // Set refresh token cookie (same as normal login)
  const isProduction = this.configService.get('NODE_ENV') === 'production';
  res.setCookie('refreshToken', result.refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    path: '/auth/refresh',
    maxAge: 7 * 24 * 60 * 60,
  });

  return {
    accessToken: result.accessToken,
    expiresIn: result.expiresIn,
    tokenType: result.tokenType,
  };
}
```

---

## Login Endpoint Return Type Güncelleme

`POST /auth/login` artık iki farklı response dönebilir:

```typescript
// Normal login (2FA kapalı):
{ accessToken, expiresIn, tokenType }

// 2FA gerekli:
{ requiresTwoFactor: true, partialToken: "..." }
```

Swagger'da `ApiResponse` ile her iki durumu da belgelenmeli.

---

## Module Güncellemeleri

### `auth.module.ts`:

```typescript
// providers'a ekle:
TotpService,

// auth.controller constructor'a ekle:
private readonly totpService: TotpService,
```

### `services/index.ts`:

```typescript
export * from './totp.service'; // EKLE
```

### `dto/index.ts`:

```typescript
export * from './totp.dto'; // EKLE
```

---

## Recovery Codes Davranışı

1. 2FA aktifleştirildiğinde **8 adet** recovery code üretilir
2. Her code **tek kullanımlık** — kullanıldıktan sonra listeden silinir
3. Login sırasında TOTP token yerine recovery code girilebilir
4. Recovery code'lar bittiğinde kullanıcı TOTP uygulamasını kullanmak zorunda
5. 2FA devre dışı bırakıp yeniden aktifleştirerek yeni code'lar alınabilir

---

## Doğrulama

```bash
npm run build
```

- Build başarılı olmalı
- `POST /auth/2fa/setup` → QR code + secret dönmeli
- `POST /auth/2fa/enable` → TOTP ile doğrulayıp recovery codes dönmeli
- `POST /auth/login` → 2FA aktifse `requiresTwoFactor: true` dönmeli
- `POST /auth/login/2fa` → partial token + TOTP ile tam token dönmeli
- Recovery code ile de giriş yapılabilmeli

---

## Kontrol Listesi

- [ ] `npm install otplib qrcode` ve `npm install -D @types/qrcode`
- [ ] User entity — 2FA alanları (Step 2'de yapılmadıysa)
- [ ] `totp.service.ts` oluştur
- [ ] `totp.dto.ts` oluştur
- [ ] `TokenService` — `generatePartialToken()` ve `verifyPartialToken()` ekle
- [ ] `AuthService.login()` — 2FA check ekle
- [ ] `AuthService.verifyTwoFactor()` — yeni metod
- [ ] `auth.controller.ts` — 4 endpoint ekle (setup, enable, disable, login/2fa)
- [ ] `auth.module.ts` — TotpService provider ekle
- [ ] `services/index.ts` — TotpService export ekle
- [ ] `dto/index.ts` — totp DTO export ekle
- [ ] Login endpoint Swagger — 2FA response belgele
- [ ] `npm run build` — başarılı
