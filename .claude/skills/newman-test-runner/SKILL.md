---
name: newman-test-runner
description: Postman collection'larını Newman CLI ile otomatik test eden skill. Postman MCP üzerinden collection bulur, Newman ile localhost'a karşı çalıştırır, başarılı ve başarısız tüm sonuçları detaylı raporlar. Bu skill'i şu durumlarda tetikle: "test et", "testleri çalıştır", "newman çalıştır", "collection test et", "API test", "endpoint test", "register test et", "login test et", "auth test et", herhangi bir "X'i test et" ifadesi, "senaryoları çalıştır", "test sonuçları", veya kullanıcı bir plan step'i tamamlayıp test istendiğinde. Multi-agent workflow'da sub-agent olarak test çalıştırmak için de tetikle.
---

# Newman Test Runner

Postman collection'larını Newman CLI ile çalıştırarak API endpoint'lerini localhost'a karşı otomatik test eder.

## Gereksinimler

- Postman MCP bağlı olmalı (collection bulmak için)
- Node.js kurulu olmalı (Newman için)
- Backend ayakta olmalı (localhost:3000)

## Workflow

Bu skill tetiklendiğinde `workflows/run-tests.md` dosyasını oku ve adımları takip et.

## Dosya Yapısı

```
newman-test-runner/
├── SKILL.md                     # Bu dosya — giriş noktası ve metadata
├── workflows/
│   └── run-tests.md             # Ana test workflow — adım adım talimatlar
├── scripts/
│   ├── check-health.sh          # Backend health check
│   ├── run-newman.sh            # Newman çalıştır + JSON export
│   └── parse-results.sh         # Newman JSON → özet rapor
└── references/
    └── diagnostics.md           # Hata diagnostik tablosu (fail olunca oku)
```

## Karar Ağacı

```
Kullanıcı: "X'i test et"
  ↓
workflows/run-tests.md oku ve takip et
  ↓
Step 1: Pre-flight kontroller
  ├─ Önceki test artıklarını temizle
  ├─ scripts/check-health.sh → backend ayakta mı?
  │   └─ DOWN → kullanıcıya bildir, dur
  ├─ Newman kurulu mu?
  │   └─ Değil → otomatik kur
  ├─ jq kurulu mu?
  │   └─ Değil → uyar, devam et (rapor ham olur)
  └─ Postman MCP bağlı mı?
      └─ Değil → uyar, curl fallback hazır
  ↓
Step 2: Postman MCP ile collection ve environment bul
  ├─ Bulunamadı → curl fallback (workflow'da açıklanıyor)
  └─ Bulundu → devam
  ↓
Step 3: scripts/run-newman.sh çalıştır → newman + JSON export
  ↓
Step 4: scripts/parse-results.sh çalıştır → özet rapor üret
  ├─ Tümü geçti → raporu göster, bitti
  └─ Fail var → references/diagnostics.md oku, root cause analiz et
  ↓
Step 5: Fail varsa fix öner veya multi-agent'ta JSON dön
  ↓
Step 6: Geçici dosyaları temizle
```

## Önemli Kurallar

- Script'leri her zaman çalıştır, adımları elle yapma
- Newman JSON çıktısını parse et, CLI çıktısını değil
- Response body'leri olduğu gibi yapıştırma, özetle
- UID kullan isim yerine — collection ismi değişebilir
- Token harcanmasın diye tam newman çıktısını basma, sadece özet raporla

  