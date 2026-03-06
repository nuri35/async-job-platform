# Step 02.8.1: Login Audit Log

## Scope

Login denemelerini (başarılı/başarısız) async olarak RabbitMQ üzerinden DB'ye kaydet. Login response'u bekletme.

## Neden Async?

Login endpoint hızlı kalmalı. Audit log yazma (~5-10ms DB write) her login'e eklenirse throughput düşer. RabbitMQ'ya publish (~1ms), worker tarafında consume ve DB write yapılır.

---

## Flow

```
Login denemesi (başarılı veya başarısız)
  → AuthService: audit event oluştur
  → AuditQueueService: RabbitMQ'ya publish (fire-and-forget)
  → Login response döner (beklemez)
  
  ... async ...

  → Worker: audit_queue'dan consume
  → Worker: login_audits tablosuna yaz
```

---

## Redis Key Yapısı

Yok — audit log Redis kullanmaz, sadece RabbitMQ + PostgreSQL.

---

## New Entity

`modules/auth/entities/login-audit.entity.ts`

```typescript
@Entity('login_audits')
@Index(['email', 'createdAt'])
@Index(['ipAddress', 'createdAt'])
@Index(['userId', 'createdAt'])
export class LoginAudit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  email: string;

  @Column({ type: 'uuid', nullable: true })
  userId: string | null;

  @Column()
  ipAddress: string;

  @Column({ nullable: true })
  userAgent: string | null;

  @Column({ type: 'enum', enum: LoginAuditResult })
  result: LoginAuditResult;

  @Column({ type: 'enum', enum: LoginFailReason, nullable: true })
  failReason: LoginFailReason | null;

  @CreateDateColumn()
  createdAt: Date;
}
```

Index'ler: email + tarih, IP + tarih, userId + tarih aramaları için. Retention cleanup da createdAt index'ini kullanır.

---

## New Enums

`modules/auth/enums/login-audit-result.enum.ts`

```typescript
export enum LoginAuditResult {
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
}
```

`modules/auth/enums/login-fail-reason.enum.ts`

```typescript
export enum LoginFailReason {
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  ACCOUNT_DISABLED = 'ACCOUNT_DISABLED',
  EMAIL_NOT_VERIFIED = 'EMAIL_NOT_VERIFIED',
  INVALID_PASSWORD = 'INVALID_PASSWORD',
}
```

---

## New Service: Audit Queue Publisher

`modules/auth/services/audit-queue.service.ts`

API tarafında çalışır. Sadece RabbitMQ'ya publish eder.

```typescript
@Injectable()
export class AuditQueueService {
  constructor(
    @Inject('AUDIT_SERVICE')
    private readonly client: ClientProxy,
  ) {}

  publishLoginAudit(payload: {
    email: string;
    userId: string | null;
    ipAddress: string;
    userAgent: string | null;
    result: LoginAuditResult;
    failReason: LoginFailReason | null;
  }): void {
    this.client.emit('auth.audit.login', {
      ...payload,
      timestamp: new Date().toISOString(),
    });
  }
}
```

Not: `emit()` fire-and-forget — await yok, login'i bloklamaz.

---

## auth.module.ts — RabbitMQ Client Registration

```typescript
ClientsModule.register([{
  name: 'AUDIT_SERVICE',
  transport: Transport.RMQ,
  options: {
    urls: [configService.get('RABBITMQ_URL')],
    queue: 'audit_queue',
    queueOptions: { durable: true },
  },
}])
```

> Not: Rate limiting planında EMAIL_SERVICE için ayrı bir ClientsModule.register var.
> İkisini aynı imports array'ine koy veya tek bir dynamic module ile yönet.

---

## AuthService.login() Değişikliği

Her rejection noktasında ve başarılı login'de audit event publish et:

```typescript
async login(dto, ipAddress, userAgent):
  const auditBase = { email: dto.email, ipAddress, userAgent };

  // 1. Find user
  const user = await this.userRepository.findByEmail(dto.email);
  if (!user) {
    this.auditQueueService.publishLoginAudit({
      ...auditBase, userId: null,
      result: LoginAuditResult.FAILED,
      failReason: LoginFailReason.USER_NOT_FOUND,
    });
    throw new UnauthorizedException('Invalid credentials');
  }

  // 2. isActive check
  if (!user.isActive) {
    this.auditQueueService.publishLoginAudit({
      ...auditBase, userId: user.id,
      result: LoginAuditResult.FAILED,
      failReason: LoginFailReason.ACCOUNT_DISABLED,
    });
    throw new UnauthorizedException('Invalid credentials');
  }

  // 3. Email verification check
  if (!user.isEmailVerified) {
    this.auditQueueService.publishLoginAudit({
      ...auditBase, userId: user.id,
      result: LoginAuditResult.FAILED,
      failReason: LoginFailReason.EMAIL_NOT_VERIFIED,
    });
    throw new UnauthorizedException('Invalid credentials');
  }

  // 4. Password check
  const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
  if (!isPasswordValid) {
    this.auditQueueService.publishLoginAudit({
      ...auditBase, userId: user.id,
      result: LoginAuditResult.FAILED,
      failReason: LoginFailReason.INVALID_PASSWORD,
    });
    throw new UnauthorizedException('Invalid credentials');
  }

  // 5. Başarılı login
  this.auditQueueService.publishLoginAudit({
    ...auditBase, userId: user.id,
    result: LoginAuditResult.SUCCESS,
    failReason: null,
  });

  // 6. Token üret, session oluştur (mevcut kod)
```

---

## Worker Tarafı: Audit Consumer

`apps/worker/src/consumers/audit.consumer.ts` (veya worker planına göre uygun konum)

```typescript
@Controller()
export class AuditConsumer {
  constructor(
    @InjectRepository(LoginAudit)
    private readonly loginAuditRepository: Repository<LoginAudit>,
  ) {}

  @EventPattern('auth.audit.login')
  async handleLoginAudit(payload: LoginAuditPayload): Promise<void> {
    await this.loginAuditRepository.save(
      this.loginAuditRepository.create({
        email: payload.email,
        userId: payload.userId,
        ipAddress: payload.ipAddress,
        userAgent: payload.userAgent,
        result: payload.result,
        failReason: payload.failReason,
      }),
    );
  }
}
```

> Worker app'te TypeOrmModule.forFeature([LoginAudit]) import edilmeli.
> Worker henüz bu consumer'ı handle edemiyorsa mesajlar RabbitMQ'da bekler — kaybolmaz, sorun değil.

---

## Retention: 90 Gün Temizlik

`modules/auth/services/login-audit-cleanup.service.ts`

```typescript
@Injectable()
export class LoginAuditCleanupService {
  private readonly RETENTION_DAYS = 90;

  constructor(
    @InjectRepository(LoginAudit)
    private readonly loginAuditRepository: Repository<LoginAudit>,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanupOldAudits(): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.RETENTION_DAYS);

    const result = await this.loginAuditRepository
      .createQueryBuilder()
      .delete()
      .where('createdAt < :cutoffDate', { cutoffDate })
      .execute();

    if (result.affected > 0) {
      this.logger.log(`Cleaned up ${result.affected} audit logs older than ${this.RETENTION_DAYS} days`);
    }
  }
}
```

ScheduleModule import edilmeli (auth.module.ts veya app.module.ts).

---

## Barrel Export Güncellemeleri

`entities/index.ts` → LoginAudit ekle
`enums/index.ts` → LoginAuditResult, LoginFailReason ekle
`services/index.ts` → AuditQueueService, LoginAuditCleanupService ekle

## auth.module.ts Güncellemesi

- imports → TypeOrmModule.forFeature([LoginAudit]), ClientsModule.register (audit_queue), ScheduleModule
- providers → AuditQueueService, LoginAuditCleanupService ekle
- entities → LoginAudit ekle

---

## Doğrulama

```bash
npm run build
```

Build 0 error olmalı.

---

## Kontrol Listesi

- [ ] LoginAudit entity oluştur (index'ler dahil)
- [ ] LoginAuditResult enum oluştur
- [ ] LoginFailReason enum oluştur
- [ ] AuditQueueService oluştur (RabbitMQ publisher)
- [ ] auth.module.ts → AUDIT_SERVICE client register
- [ ] AuthService.login() → her rejection ve başarılı login'de audit publish
- [ ] Worker: AuditConsumer oluştur (EventPattern handler)
- [ ] LoginAuditCleanupService oluştur (90 gün cron)
- [ ] Barrel export'ları güncelle
- [ ] auth.module.ts güncelle
- [ ] npm run build — 0 error

## Do NOT Touch

- Register flow
- Refresh/logout/session endpoints
- Token service
- Rate limiting (ayrı plan)
- Email queue (rate limiting planında)
- Jobs module
- Mevcut worker job handlers