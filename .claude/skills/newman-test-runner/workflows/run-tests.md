# Run Tests Workflow

## Metadata
- **Complexity**: Low-Medium
- **Estimated Time**: 30 saniye - 2 dakika
- **Prerequisites**: Postman MCP bağlı, Node.js kurulu, Backend ayakta

## Step 1: Ön Kontroller (Pre-flight)

Tüm kontrolleri sırayla yap. Herhangi biri fail ederse dur ve kullanıcıya bildir.

### 1a. Önceki Test Artıklarını Temizle

```bash
rm -f /tmp/newman-results.json
```

Önceki testten kalan sonuç dosyası yeni testi kirletebilir.

### 1b. Backend Health Check

```bash
bash {SKILL_DIR}/scripts/check-health.sh
```

Çıktı `UP` değilse kullanıcıya bildir ve dur:
"Backend ayakta değil. `npm run start:dev` ile başlat, sonra tekrar dene."

### 1c. Newman Kontrolü

```bash
newman --version 2>/dev/null || echo "NOT_INSTALLED"
```

Kurulu değilse:
```bash
npm install -g newman
```
Permission hatası alırsa `npx newman` kullanılacak (Step 3'te otomatik handle edilir).

### 1d. jq Kontrolü

```bash
jq --version 2>/dev/null || echo "NOT_INSTALLED"
```

jq yoksa uyar: "jq kurulu değil. Rapor formatlanmadan gösterilecek. Kur: `sudo apt install jq` veya `brew install jq`"
jq olmadan da devam edilebilir ama rapor ham JSON olur.

### 1e. Postman MCP Bağlantı Kontrolü

Postman MCP tool'larından herhangi birini çağır (workspace listele gibi).
- Başarılı → devam
- Hata/timeout → "Postman MCP bağlı değil. `/mcp` ile kontrol et. Collection bulunamazsa curl fallback kullanılacak."

## Step 2: Collection ve Environment Bul

Postman MCP tool'larını kullanarak:

**Collection bul:**
- Kullanıcının söylediği anahtar kelimeyle collection ara
- Örnek: "register test et" → "Register" veya "Auth - Register" içeren collection
- Collection UID'yi al (isim değil, UID güvenilir)

**Environment bul:**
- "Development" environment'ını ara
- base_url değerini kontrol et
- Bulunamazsa default: `http://localhost:3000`

**Collection bulunamazsa → Curl Fallback:**
Kullanıcıya sor: "Collection bulunamadı. curl ile direkt test edeyim mi?"

Curl ile test et:
```bash
curl -s -w "\nHTTP_CODE:%{http_code} TIME:%{time_total}s" \
  -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "test@gmail.com", "password": "Test1234"}'
```

Curl sonuçlarını da aynı rapor formatında göster ve dur.

## Step 3: Newman ile Test Çalıştır

```bash
bash {SKILL_DIR}/scripts/run-newman.sh "{COLLECTION_UID}" "{ENV_UID}" "{POSTMAN_API_KEY}"
```

Script parametreleri:
- `$1` → Collection UID (zorunlu)
- `$2` → Environment UID (opsiyonel, boş bırakılabilir)
- `$3` → Postman API Key

Script şunları yapar:
1. Newman'ı collection URL ile çalıştırır
2. JSON sonuçları `/tmp/newman-results.json`'a export eder
3. Exit code 0 = hepsi geçti, 1 = fail var

**Belirli klasör çalıştırmak için:**
```bash
bash {SKILL_DIR}/scripts/run-newman.sh "{COLLECTION_UID}" "{ENV_UID}" "{API_KEY}" "{FOLDER_NAME}"
```

## Step 4: Sonuçları Raporla

```bash
bash {SKILL_DIR}/scripts/parse-results.sh
```

Script `/tmp/newman-results.json` dosyasını okur ve özet rapor üretir.

Rapor formatı:

```
═══════════════════════════════════════
  TEST SONUÇLARI: {Collection Adı}
═══════════════════════════════════════

  Toplam Request:     7
  Başarısız Request:  1
  Toplam Assertion:   14
  Başarısız Assertion: 2
  Toplam Süre:        234ms

✅ BAŞARILI (5/7)
─────────────────────────────────────
  ✅ Request Adı
     METHOD /path → STATUS (TIMEms)
     Assertion'lar: ✓ geçenler
     Body: kısa özet

❌ BAŞARISIZ (2/7)
─────────────────────────────────────
  ❌ Request Adı
     METHOD /path → STATUS (TIMEms)
     ✗ HataTipi: "assertion adı"
       Beklenen: X
       Gerçek: Y

═══════════════════════════════════════
  ÖZET: 5/7 geçti | 2 fail | Süre: 234ms
═══════════════════════════════════════
```

## Step 5: Fail Analizi (Sub-Agent ile Otomatik)

Eğer fail varsa `references/diagnostics.md` dosyasını oku.

### 5a. Hata Tipini Belirle

Parse sonuçlarından hata tipini çıkar:
- **5xx hatası** (500, 502, 503) → Backend seviye hata → Sub-agent: Log Analiz
- **4xx beklenenden farklı** (beklenen 400, gelen 500) → Backend seviye hata → Sub-agent: Log Analiz
- **Assertion fail** (status doğru ama body yanlış) → Kod mantık hatası → Sub-agent: Kod Analiz
- **Connection error** → Backend down → Kullanıcıya bildir, dur

### 5b. Sub-Agent: Backend Log Analizi (5xx hatalarında)

500 veya beklenmeyen status code aldığında log-analyzer-agent'ı spawn et:

```bash
claude --agent .claude/agents/log-analyzer-agent.md -p "
Backend'de 500 hatası alıyorum.
Endpoint: {METHOD} {PATH}
Status: {CODE}
Newman error: {ERROR_MSG}
Logları oku, root cause bul, JSON dön.
"
```

Sub-agent sonucunu oku. Root cause'a göre:
- DB bağlantısı → "PostgreSQL ayakta mı? .env'deki DB_HOST, DB_PORT kontrol et"
- Redis bağlantısı → "Redis ayakta mı? REDIS_HOST, REDIS_PORT kontrol et"
- Missing dependency → "Module'de import eksik: {dosya} dosyasına {dependency} ekle"
- Null reference → "{dosya}:{satır}'da null check eksik"

### 5c. Sub-Agent: Kod Mantık Analizi (assertion fail'lerde)

Status code doğru ama response body beklenen formatta değilse code-analyzer-agent'ı spawn et:

```bash
claude --agent .claude/agents/code-analyzer-agent.md -p "
API testi fail etti.
Endpoint: {METHOD} {PATH}
Status: {CODE}
Beklenen body: {EXPECTED}
Gerçek body: {ACTUAL}
İlgili kodu oku, neden farklı olduğunu bul, JSON dön.
"
```

### 5d. Ana Agent Fix

Sub-agent'tan gelen JSON sonuca göre:
- Fix önerisini uygula
- Build çalıştır
- Tekrar test et (Step 3'e dön)
- Geçene kadar döngüyü tekrarla (max 3 deneme)

```
Test fail → Sub-agent analiz → Ana agent fix → Build → Tekrar test
  └─ 3 denemede çözülmezse → kullanıcıya bildir, manual müdahale iste
```

### 5e. Standalone Mod (sub-agent yoksa)

Eğer `claude -p` kullanılamıyorsa:
- Diagnostik tablosundan olası sebebi belirle
- Fail'leri göster + fix öner
- "Fix yapayım mı?" diye sor

## Step 6: Temizlik

```bash
rm -f /tmp/newman-results.json
```

## Zincirleme Test Senaryoları

Bazı testlerde sıra önemli:

```
register → verify-email → login → access_token al → protected endpoint
```

Bu durumda:
- Collection'daki Postman test script'leri chaining'i halleder
- Curl fallback'te önceki response'tan değer çek:
```bash
TOKEN=$(curl -s ... | jq -r '.accessToken')
curl -H "Authorization: Bearer $TOKEN" ...
```