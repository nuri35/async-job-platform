Build geçti. Şimdi post-implementation pipeline'ı Agent Teams ile çalıştır.

## Takım Kuralları
- Sen (lead) hiçbir şeyi kendin YAPMA. Sadece koordine et ve sentezle.
- Tüm teammate'ler bitene kadar BEKLE. Erken kapatma.
- Her teammate sadece kendi dosyalarına dokunur.
- Teammate'ler arası dosya çakışması OLMAMALI.

## Bilinen Sorunlar ve Çözümleri

**Task status lag:** Teammate görevi bitirdi ama status "done" olarak işaretlemedi → bağımlı görev blocked kalır.
- Her 30 saniyede teammate'lerin durumunu kontrol et.
- Görev takılmış görünüyorsa teammate'e "Mark your task as done" mesajı gönder.
- 2 dakika yanıt yoksa görevi manuel "done" olarak işaretle ve devam et.

**Lead erken kapatma:** Tüm görevler bitmeden takımı kapatma.
- Rapor yazmadan önce TaskList ile TÜM görevlerin "done" olduğunu doğrula.
- Herhangi biri "in_progress" veya "blocked" ise BEKLE.
- Teammate 5 (DB Inspection) bitene kadar takımı KAPATMA.

**Session crash:** /resume teammate'leri geri yüklemez.
- Crash olursa kullanıcıya bildir: "Session kesildi. /post-implement tekrar çalıştır."
- Tamamlanan görevleri tekrar çalıştırmamak için önce mevcut Postman collection, .spec.ts dosyaları ve DB state'i kontrol et.

## Takım Yapısı

### Paralel Görevler (aynı anda başlasın, birbirinden bağımsız)

**Teammate 1: Postman Collection**
- Önce şu plan dosyalarını oku ve ne implement edildiğini anla:
  - plans/login-hardening.md (enumeration fix, email verification check)
  - plans/login-rate-limiting.md (sliding window, progressive delay, lockout, IP block)
  - plans/email-queue-rabbitmq.md (RabbitMQ publisher, topic exchange, consumer)
- Postman MCP kullanarak "Auth - Login" collection oluştur
- Development environment'a bağla (base_url: http://localhost:3000)

Test grupları:

**Folder 1: Login Basic**
- Başarılı login (geçerli email + şifre) → 200/201, accessToken + refreshToken döner
- Yanlış şifre → 401 "Invalid credentials"
- Olmayan email → 401 "Invalid credentials" (aynı mesaj — enumeration koruması)
- Disabled account → 401 "Invalid credentials" (aynı mesaj — enumeration koruması)
- Unverified email → 401 "Invalid credentials" (aynı mesaj — enumeration koruması)
- Boş body → 400 validation error

**Folder 2: Login Rate Limiting (Email)**
- 1. ve 2. başarısız login → anında response
- 3. başarısız login → response ~1s gecikmeli (progressive delay)
- 4. başarısız login → response ~2s gecikmeli
- 5. başarısız login → account lock, 429 veya "Invalid credentials"
- Lock sonrası login denemesi → reject (email kilitli)
- Başarılı login sonrası counter sıfırlanma testi (önce 2 fail, sonra başarılı, sonra tekrar fail → counter 1'den başlamalı)

**Folder 3: Login Rate Limiting (IP)**
- Farklı email'lerle aynı IP'den 15 başarısız deneme → IP block
- IP block sonrası herhangi email ile login → reject

**Folder 4: RabbitMQ Email Notification**
- 5. fail sonrası lock tetiklenmesi → RabbitMQ'da email.lock mesajı oluşmalı
- Lock notify cooldown testi → 1 saat içinde ikinci lock'ta email gitmemeli
- RabbitMQ Management API ile queue'daki mesajı kontrol et (http://localhost:15672/api/queues/%2F/email_queue)

Her request'e assertion ekle (status code, body field validation, response time).
Dosya sahipliği: SADECE Postman MCP, kod dosyalarına DOKUNMA

**Teammate 2: Swagger Docs**
- Önce plan dosyalarını oku: login-hardening.md, login-rate-limiting.md, email-queue-rabbitmq.md
- Login endpoint'inin swagger decorator'larını kontrol et:
  - @ApiResponse 401 — "Invalid credentials" (tüm fail senaryoları aynı mesaj)
  - @ApiResponse 429 — "Too many requests" (rate limit / lock / block durumları)
  - @ApiBody — LoginDto
  - @ApiOperation — summary ve description güncel mi
- Rate limit header'ları dokümante et (X-RateLimit-Limit, Retry-After varsa)
- Dosya sahipliği: SADECE controller dosyalarındaki decorator'lar, başka dosyaya DOKUNMA

**Teammate 3: Unit Test**
- Önce plan dosyalarını oku: login-hardening.md, login-rate-limiting.md, email-queue-rabbitmq.md
- Oluşturulacak test dosyaları:

**login-rate-limit.service.spec.ts:**
- addToSlidingWindow — Redis sorted set komutlarını mock'la, count doğru dönmeli
- checkIpBlocked — block key varsa exception fırlatmalı
- checkEmailLocked — lock key varsa exception fırlatmalı
- recordFailedAttempt — threshold aşılınca lock/block tetiklenmeli
- calculateDelay — progressive delay doğru hesaplanmalı (0, 1000, 2000, 4000, 8000)
- clearEmailCounters — sorted set silinmeli

**email-queue.service.spec.ts:**
- publishLockNotification — client.emit doğru routing key ile çağrılmalı (email.lock)
- fire-and-forget — await olmadığını doğrula

**email-consumer.controller.spec.ts:**
- handleLockNotification — başarılı: emailService.sendMail çağrılmalı + channel.ack
- handleLockNotification — fail: retry count < 3 ise nack(requeue: true)
- handleLockNotification — fail: retry count >= 3 ise nack(requeue: false) → DLQ

**auth.service.spec.ts (login kısmı güncelle):**
- Unverified email → UnauthorizedException + audit publish
- Disabled account → UnauthorizedException + aynı mesaj (enumeration)
- Başarılı login → clearEmailCounters çağrılmalı
- Başarısız login → recordFailedAttempt çağrılmalı

Jest mock pattern'lerini kullan (Repository, Redis, ClientProxy)
Dosya sahipliği: SADECE .spec.ts dosyaları oluştur/düzenle

### Sıralı Görevler (dependency chain)

**Teammate 4: Newman Integration Test** → DEPENDS ON: Teammate 1
- newman-test-runner skill'ini kullanarak Teammate 1'in oluşturduğu "Auth - Login" collection'ı çalıştır
- Tüm folder'ları sırayla çalıştır: Login Basic → Rate Limiting Email → Rate Limiting IP → RabbitMQ
- Rate limiting testleri arasında Redis counter'ların sıfırlanması gerekebilir — test sırası önemli
- Fail olursa log-analyzer-agent veya code-analyzer-agent subagent spawn et
- Subagent sonucuna göre fix öner (ama kendisi fix YAPMASIN)
- Max 3 retry
- Dosya sahipliği: SADECE test çalıştır ve raporla, kod dosyalarına DOKUNMA

**Teammate 5: DB Inspection** → DEPENDS ON: Teammate 4
- PostgreSQL MCP ile:
  - login_audits tablosu oluşmuş mu? Kayıtlar var mı?
  - SELECT * FROM login_audits ORDER BY created_at DESC LIMIT 20
  - fail_reason dağılımı: her LoginFailReason enum değerinden kayıt var mı?
  - Başarılı login kaydı var mı (result = SUCCESS)?
  - users tablosu: is_email_verified, is_active durumları

- Redis MCP ile:
  - login:sw:email:* key'leri (sliding window sorted set) — ZCARD ile count kontrol
  - login:lock:email:* key'leri — lock var mı, TTL ne?
  - login:sw:ip:* key'leri — IP counter durumu
  - login:block:ip:* key'leri — IP block var mı?
  - login:lock-notify:* key'leri — cooldown aktif mi, TTL ne?

- RabbitMQ Management API ile (http://localhost:15672):
  - app_exchange oluşmuş mu (topic type)?
  - email_queue → app_exchange'e email.# ile bind olmuş mu?
  - email_queue_dlq oluşmuş mu?
  - Queue'da bekleyen mesaj var mı?

- Her bulguyu yorumla — beklenen davranışla uyumlu mu?
- Dosya sahipliği: HİÇBİR ŞEYİ DEĞİŞTİRME, sadece oku ve raporla

## Dependency Chain

```
Teammate 1 (Postman) ─┐
Teammate 2 (Swagger)  ─┤── Paralel
Teammate 3 (Unit Test)─┘
         │
         ▼ (Teammate 1 bitti)
Teammate 4 (Newman Test)
         │
         ▼ (Teammate 4 bitti)
Teammate 5 (DB Inspection)
```

## Son Rapor

Tüm teammate'ler bitince sentezlenmiş rapor oluştur:

```
═══════════════════════════════════════════════
  POST-IMPLEMENTATION RAPORU
═══════════════════════════════════════════════

📦 POSTMAN COLLECTION
  - Collection adı: ...
  - Request sayısı: ...
  - Assertion sayısı: ...

📝 SWAGGER DOCS
  - Güncellenen endpoint'ler: ...
  - Eklenen decorator'lar: ...

🧪 UNIT TESTS
  - Test dosyası: ...
  - Test sayısı: ...
  - Coverage: happy path / edge case / error case

🔬 NEWMAN INTEGRATION TEST
  - Toplam: .../... geçti
  - Fail varsa: root cause ve fix önerisi
  - Retry sayısı: ...

🗄️ DB INSPECTION
  - PostgreSQL: ...
  - Redis: ...
  - Beklenmeyen durum var mı: ...

═══════════════════════════════════════════════
  SONUÇ: [BAŞARILI / KISMI / BAŞARISIZ]
═══════════════════════════════════════════════
```

Eğer herhangi bir teammate fail ederse, hangi teammate'in fail ettiğini ve sebebini açıkla. Fix gerekiyorsa ne yapılması gerektiğini öner ama kendin YAPMA — kullanıcıya bırak.