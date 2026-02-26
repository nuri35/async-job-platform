# 04 — API Keys

## Amaç

Dış servisler ve otomasyon araçları için API key tabanlı kimlik doğrulama. Job submit etmek için kullanıcılar API key oluşturabilir. Plain text key saklanmaz — SHA-256 hash kullanılır.

---

## Yeni Dosyalar

### 1. Entity: `libs/common/src/entities/api-key.entity.ts`

```typescript
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';

@Entity('api_keys')
export class ApiKey {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  @Index()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ length: 100 })
  name: string;

  @Column({ length: 8 })
  keyPrefix: string; // İlk 8 karakter — tanımlama için (ajp_xxxx)

  @Column({ unique: true })
  @Index()
  keyHash: string; // SHA-256 hash — güvenlik için plain text saklanmaz

  @Column({ type: 'timestamp', nullable: true })
  lastUsedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  expiresAt: Date | null; // null = süresiz

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
```

### Tasarım Kararları

- **keyPrefix:** `ajp_` prefix + 4 karakter → key'i tanımlamak için (ör: `ajp_a1b2...`)
- **keyHash:** SHA-256 — API key'ler high-entropy, bcrypt gereksiz yavaş
- **Show once:** Raw key sadece oluşturulurken gösterilir, DB'de sadece hash saklanır
- **expiresAt:** Opsiyonel, null = süresiz

---

### 2. Repository: `apps/async-job-platform/src/modules/auth/repositories/api-key.repository.interface.ts`

```typescript
export abstract class IApiKeyRepository {
  abstract findByKeyHash(keyHash: string): Promise<ApiKey | null>;
  abstract findByUserId(userId: string): Promise<ApiKey[]>;
  abstract findByIdAndUserId(
    id: string,
    userId: string,
  ): Promise<ApiKey | null>;
  abstract create(data: Partial<ApiKey>): ApiKey;
  abstract save(apiKey: ApiKey): Promise<ApiKey>;
}
```

### 3. Repository: `apps/async-job-platform/src/modules/auth/repositories/api-key.repository.ts`

Standard TypeORM repository implementasyonu. `BaseRepository`'den extend edebilir veya standalone olabilir.

Önemli metodlar:

- `findByKeyHash()` — API key validation sırasında hash ile arama
- `findByUserId()` — kullanıcının key listesi
- `updateLastUsedAt()` — key kullanıldığında tarih güncelle

---

### 4. Service: `apps/async-job-platform/src/modules/auth/services/api-key.service.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { IApiKeyRepository } from '../repositories';
import { IUserRepository } from '../repositories';

@Injectable()
export class ApiKeyService {
  constructor(
    private readonly apiKeyRepository: IApiKeyRepository,
    private readonly userRepository: IUserRepository,
  ) {}

  async createKey(
    userId: string,
    name: string,
    expiresAt?: Date,
  ): Promise<{
    key: string; // Raw key — sadece bir kez gösterilir!
    id: string;
    name: string;
    keyPrefix: string;
    createdAt: Date;
    expiresAt: Date | null;
  }> {
    // 1. Generate random key: ajp_ + 48 random bytes (base64url)
    const rawKey = `ajp_${randomBytes(48).toString('base64url')}`;
    const keyPrefix = rawKey.substring(0, 8); // "ajp_xxxx"
    const keyHash = this.hashKey(rawKey);

    // 2. Save to DB (only hash stored)
    const apiKey = this.apiKeyRepository.create({
      userId,
      name,
      keyPrefix,
      keyHash,
      expiresAt: expiresAt || null,
    });
    const saved = await this.apiKeyRepository.save(apiKey);

    // 3. Return raw key (shown only once!)
    return {
      key: rawKey,
      id: saved.id,
      name: saved.name,
      keyPrefix: saved.keyPrefix,
      createdAt: saved.createdAt,
      expiresAt: saved.expiresAt,
    };
  }

  async validateKey(rawKey: string): Promise<User | null> {
    const keyHash = this.hashKey(rawKey);
    const apiKey = await this.apiKeyRepository.findByKeyHash(keyHash);

    if (!apiKey) return null;
    if (!apiKey.isActive) return null;
    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) return null;

    // Update lastUsedAt (fire-and-forget)
    apiKey.lastUsedAt = new Date();
    this.apiKeyRepository.save(apiKey);

    return this.userRepository.findById(apiKey.userId);
  }

  async listKeys(userId: string): Promise<
    Array<{
      id: string;
      name: string;
      keyPrefix: string;
      lastUsedAt: Date | null;
      expiresAt: Date | null;
      isActive: boolean;
      createdAt: Date;
    }>
  > {
    const keys = await this.apiKeyRepository.findByUserId(userId);
    return keys.map((k) => ({
      id: k.id,
      name: k.name,
      keyPrefix: k.keyPrefix,
      lastUsedAt: k.lastUsedAt,
      expiresAt: k.expiresAt,
      isActive: k.isActive,
      createdAt: k.createdAt,
    }));
  }

  async revokeKey(keyId: string, userId: string): Promise<void> {
    const apiKey = await this.apiKeyRepository.findByIdAndUserId(keyId, userId);
    if (!apiKey) throw new NotFoundException('API key not found');

    apiKey.isActive = false;
    await this.apiKeyRepository.save(apiKey);
  }

  private hashKey(rawKey: string): string {
    return createHash('sha256').update(rawKey).digest('hex');
  }
}
```

---

### 5. Guard: `apps/async-job-platform/src/modules/auth/guards/api-key.guard.ts`

```typescript
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiKeyService } from '../services/api-key.service';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly apiKeyService: ApiKeyService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['x-api-key'];

    if (!apiKey || typeof apiKey !== 'string') {
      throw new UnauthorizedException('API key is required');
    }

    const user = await this.apiKeyService.validateKey(apiKey);
    if (!user) {
      throw new UnauthorizedException('Invalid or expired API key');
    }

    // User'ı request'e ekle (JwtAuthGuard ile aynı pattern)
    request.user = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    return true;
  }
}
```

---

### 6. DTOs: `apps/async-job-platform/src/modules/auth/dto/api-key.dto.ts`

```typescript
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  MaxLength,
  IsOptional,
  IsDateString,
} from 'class-validator';

export class CreateApiKeyDto {
  @ApiProperty({ example: 'CI/CD Pipeline', description: 'API key adı' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({
    example: '2025-12-31T23:59:59Z',
    description: 'Opsiyonel son kullanma tarihi',
  })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class ApiKeyResponseDto {
  @ApiProperty({ example: 'uuid' })
  id: string;

  @ApiProperty({ example: 'CI/CD Pipeline' })
  name: string;

  @ApiProperty({ example: 'ajp_a1b2' })
  keyPrefix: string;

  @ApiProperty({ example: '2024-01-15T10:00:00Z' })
  createdAt: Date;

  @ApiPropertyOptional()
  expiresAt: Date | null;

  @ApiPropertyOptional()
  lastUsedAt: Date | null;

  @ApiProperty({ example: true })
  isActive: boolean;
}

export class ApiKeyCreatedResponseDto extends ApiKeyResponseDto {
  @ApiProperty({
    example: 'ajp_a1b2c3d4e5f6...',
    description: 'Full API key — sadece bir kez gösterilir!',
  })
  key: string;
}
```

---

## Endpoints (AuthController'a eklenir)

```typescript
// POST /auth/api-keys — Yeni key oluştur
@UseGuards(JwtAuthGuard)
@Post('api-keys')
@ApiBearerAuth()
@ApiOperation({ summary: 'Create a new API key' })
@ApiResponse({ status: 201, type: ApiKeyCreatedResponseDto })
async createApiKey(
  @CurrentUser('sub') userId: string,
  @Body() dto: CreateApiKeyDto,
): Promise<ApiKeyCreatedResponseDto> {
  return this.apiKeyService.createKey(
    userId,
    dto.name,
    dto.expiresAt ? new Date(dto.expiresAt) : undefined,
  );
}

// GET /auth/api-keys — Key listesi
@UseGuards(JwtAuthGuard)
@Get('api-keys')
@ApiBearerAuth()
@ApiOperation({ summary: 'List all API keys' })
@ApiResponse({ status: 200, type: [ApiKeyResponseDto] })
async listApiKeys(
  @CurrentUser('sub') userId: string,
): Promise<ApiKeyResponseDto[]> {
  return this.apiKeyService.listKeys(userId);
}

// DELETE /auth/api-keys/:id — Key iptal et
@UseGuards(JwtAuthGuard)
@Delete('api-keys/:id')
@HttpCode(HttpStatus.NO_CONTENT)
@ApiBearerAuth()
@ApiOperation({ summary: 'Revoke an API key' })
@ApiParam({ name: 'id', description: 'API key ID' })
@ApiResponse({ status: 204, description: 'API key revoked' })
@ApiResponse({ status: 404, description: 'API key not found' })
async revokeApiKey(
  @CurrentUser('sub') userId: string,
  @Param('id') keyId: string,
): Promise<void> {
  await this.apiKeyService.revokeKey(keyId, userId);
}
```

---

## Module Güncellemeleri

### `libs/common/src/entities/index.ts`:

```typescript
export * from './api-key.entity'; // EKLE
```

### `auth.module.ts`:

```typescript
// imports → TypeOrmModule.forFeature'a ekle:
ApiKey

// providers'a ekle:
ApiKeyService,
ApiKeyGuard,
{ provide: IApiKeyRepository, useClass: ApiKeyRepository },

// exports'a ekle (diğer modüller API key guard kullanabilsin):
ApiKeyGuard,
ApiKeyService,
```

### `dto/index.ts`:

```typescript
export * from './api-key.dto'; // EKLE
```

### `repositories/index.ts`:

```typescript
export * from './api-key.repository.interface'; // EKLE
export * from './api-key.repository'; // EKLE
```

### `guards/index.ts`:

```typescript
export * from './api-key.guard'; // EKLE
```

### `services/index.ts`:

```typescript
export * from './api-key.service'; // EKLE
```

---

## User Entity — ApiKeys İlişkisi

```typescript
// User entity'ye ekle:
@OneToMany(() => ApiKey, (apiKey) => apiKey.user)
apiKeys: ApiKey[];
```

---

## Güvenlik Notları

1. **SHA-256 vs bcrypt:** API key'ler high-entropy (64+ karakter random), dictionary attack riski yok → SHA-256 yeterli ve çok daha hızlı
2. **Show once:** Raw key sadece `POST /auth/api-keys` response'unda döner, sonra tekrar erişilemez
3. **keyPrefix:** Key'i tanımlamak için ilk 8 karakter saklanır (ör: `ajp_a1b2`)
4. **Soft delete:** `isActive = false` ile deactivate, hard delete yok

---

## Doğrulama

```bash
npm run build
```

- Build başarılı olmalı
- `POST /auth/api-keys` → key oluşturulmalı
- `GET /auth/api-keys` → key listesi dönmeli (raw key yok, sadece prefix)
- `DELETE /auth/api-keys/:id` → key deactivate olmalı
- `X-API-Key` header ile auth olunabilmeli

---

## Kontrol Listesi

- [ ] `api-key.entity.ts` oluştur
- [ ] `api-key.repository.interface.ts` oluştur
- [ ] `api-key.repository.ts` oluştur
- [ ] `api-key.service.ts` oluştur
- [ ] `api-key.guard.ts` oluştur
- [ ] `api-key.dto.ts` oluştur
- [ ] `auth.controller.ts` — 3 endpoint ekle (POST, GET, DELETE)
- [ ] `auth.module.ts` — entity, service, guard, repository kaydet
- [ ] `entities/index.ts` — ApiKey export ekle
- [ ] `dto/index.ts` — api-key DTO export ekle
- [ ] `repositories/index.ts` — api-key repo export ekle
- [ ] `guards/index.ts` — ApiKeyGuard export ekle
- [ ] `services/index.ts` — ApiKeyService export ekle
- [ ] `User` entity — `apiKeys` relation ekle
- [ ] `npm run build` — başarılı
