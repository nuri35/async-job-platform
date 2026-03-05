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
- Postman MCP kullanarak implement edilen feature için test collection oluştur
- Her request'e test assertion ekle (status code, body validation)
- Development environment'a bağla
- Dosya sahipliği: SADECE Postman MCP, kod dosyalarına DOKUNMA

**Teammate 2: Swagger Docs**
- Implement edilen endpoint'lerin swagger decorator'larını kontrol et
- Eksik @ApiResponse, @ApiBody, @ApiParam, @ApiOperation varsa ekle
- Dosya sahipliği: SADECE controller dosyalarındaki decorator'lar, başka dosyaya DOKUNMA

**Teammate 3: Unit Test**
- Implement edilen service için .spec.ts dosyası oluştur
- Happy path + edge case + error case testleri yaz
- Jest mock pattern'lerini kullan (Repository, Redis, external services)
- Dosya sahipliği: SADECE .spec.ts dosyaları oluştur/düzenle

### Sıralı Görevler (dependency chain)

**Teammate 4: Newman Integration Test** → DEPENDS ON: Teammate 1
- newman-test-runner skill'ini kullanarak Teammate 1'in oluşturduğu collection'ı çalıştır
- Fail olursa log-analyzer-agent veya code-analyzer-agent subagent spawn et
- Subagent sonucuna göre fix öner (ama kendisi fix YAPMASIN)
- Max 3 retry
- Dosya sahipliği: SADECE test çalıştır ve raporla, kod dosyalarına DOKUNMA

**Teammate 5: DB Inspection** → DEPENDS ON: Teammate 4
- PostgreSQL MCP ile implement edilen feature'ın ilgili tablolarını sorgula
- Redis MCP ile ilgili key'leri kontrol et (rate limit, blacklist, verification, session)
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