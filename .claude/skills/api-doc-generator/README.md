# API Documentation Generator Skill

> NestJS projelerinde Swagger/OpenAPI dokümantasyonunu otomatik oluşturan Claude Code skill'i.

## Bu Skill Ne Yapıyor?

"document the auth endpoints" dediğinde, Claude Code controller'larını tarayıp
`@ApiOperation`, `@ApiResponse`, `@ApiBody`, `@ApiProperty` gibi dekoratörleri
otomatik ekliyor. Elle tek tek yazmaktan kurtuluyorsun.

---

## Projeye Nasıl Eklenir? (Adım Adım)

### Adım 1: Skill Klasörünü Oluştur

Projenin kök dizininde `.claude/skills/` klasörü zaten varsa, sadece yeni klasörü ekle.
Yoksa tüm yapıyı oluştur.

```bash
# Projenin kök dizininde çalıştır
mkdir -p .claude/skills/api-doc-generator/cookbook
mkdir -p .claude/skills/api-doc-generator/prompts
mkdir -p .claude/skills/api-doc-generator/tools
```

Sonuç olarak şu yapı olmalı:

```
projen/
├── src/
├── .claude/
│   └── skills/
│       ├── fork-terminal/        ← zaten varsa dokunma
│       │   └── SKILL.md
│       └── api-doc-generator/    ← YENİ EKLENDİ
│           ├── SKILL.md
│           ├── cookbook/
│           │   ├── controller-docs.md
│           │   ├── dto-docs.md
│           │   └── full-module-docs.md
│           ├── prompts/
│           │   ├── swagger-decorators.md
│           │   └── response-examples.md
│           └── tools/
│               └── scan_endpoints.py
├── package.json
└── tsconfig.json
```

### Adım 2: Dosyaları Kopyala

ZIP'i indirdiysen, içindeki dosyaları ilgili klasörlere kopyala:

```bash
# ZIP'i aç
unzip api-doc-generator-skill.zip

# Dosyaları projenin .claude/skills/ altına kopyala
cp -r .claude/skills/api-doc-generator/ <projen>/.claude/skills/api-doc-generator/
```

Manuel kopyalıyorsan, dosya listesi:

| Dosya | Nereye kopyalanacak |
|-------|---------------------|
| SKILL.md | `.claude/skills/api-doc-generator/SKILL.md` |
| controller-docs.md | `.claude/skills/api-doc-generator/cookbook/controller-docs.md` |
| dto-docs.md | `.claude/skills/api-doc-generator/cookbook/dto-docs.md` |
| full-module-docs.md | `.claude/skills/api-doc-generator/cookbook/full-module-docs.md` |
| swagger-decorators.md | `.claude/skills/api-doc-generator/prompts/swagger-decorators.md` |
| response-examples.md | `.claude/skills/api-doc-generator/prompts/response-examples.md` |
| scan_endpoints.py | `.claude/skills/api-doc-generator/tools/scan_endpoints.py` |

### Adım 3: @nestjs/swagger Paketini Kontrol Et

Projenizde `@nestjs/swagger` yüklü olmalı:

```bash
# Kontrol et
npm list @nestjs/swagger

# Yoksa yükle
npm install @nestjs/swagger
```

### Adım 4: Test Et

Claude Code'u aç ve şu komutlardan birini dene:

```bash
# Tek bir controller'ı dokümante et
"document the auth endpoints"

# DTO'ları dokümante et
"add swagger docs to DTOs in user module"

# Tüm modülü dokümante et
"document everything in the order module"
```

---

## Nasıl Çalışıyor?

### Akış Diyagramı

```
Kullanıcı: "document the auth endpoints"
    │
    ▼
[1] SKILL.md → "document endpoints" trigger eşleşti
    │
    ▼
[2] SKILL.md workflow → hangi adımları takip etmeli?
    │
    ▼
[3] tools/scan_endpoints.py → controller'ı tara, endpoint'leri çıkar
    │
    ▼
[4] Cookbook seçimi → "endpoints" istendi → cookbook/controller-docs.md
    │    (dto-docs.md ve full-module-docs.md OKUNMADI)
    │
    ▼
[5] prompts/swagger-decorators.md → doğru format referansı
    │
    ▼
[6] INCLUDE_EXAMPLES=true → prompts/response-examples.md de okundu
    │
    ▼
[7] Controller dosyası güncellendi → Swagger dekoratörleri eklendi
```

### Progressive Disclosure

Her senaryoda farklı dosyalar okunur:

| Senaryo | Okunan Dosyalar | Okunmayan Dosyalar |
|---------|-----------------|---------------------|
| Controller docs | SKILL.md, scan_endpoints.py, controller-docs.md, swagger-decorators.md, response-examples.md | dto-docs.md, full-module-docs.md |
| DTO docs | SKILL.md, dto-docs.md, swagger-decorators.md | controller-docs.md, full-module-docs.md, scan_endpoints.py, response-examples.md |
| Full module | SKILL.md, scan_endpoints.py, full-module-docs.md → controller-docs.md → dto-docs.md, swagger-decorators.md, response-examples.md | (hepsi okunur) |

---

## Dosya Açıklamaları

### SKILL.md (Beyin)
Tüm routing ve orkestrasyon burada. Trigger'ları tanımlıyor (hangi kelimeler skill'i
tetikler), Variables ile konfigürasyon sağlıyor, Workflow ile adımları belirliyor,
Cookbook referanslarıyla IF/THEN yönlendirme yapıyor.

### cookbook/controller-docs.md (Controller Tarifi)
Sadece controller endpoint dokümantasyonu istendiğinde okunuyor. Her endpoint için
hangi dekoratörlerin ekleneceğini, response kodlarının nasıl belirleneceğini,
import yönetimini detaylı anlatıyor. Önce/sonra örnekleri var.

### cookbook/dto-docs.md (DTO Tarifi)
Sadece DTO dokümantasyonu istendiğinde okunuyor. Property tipleri (enum, array,
nested object, date), class-validator mapping'leri ve format kurallarını içeriyor.
Önce/sonra örnekleri var.

### cookbook/full-module-docs.md (Tam Modül Tarifi)
"Document everything" dendiğinde okunuyor. Diğer iki cookbook'u sırasıyla uyguluyor
ve SwaggerModule setup kontrolü yapıyor. Orkestrasyon dosyası.

### prompts/swagger-decorators.md (Format Referansı)
Tüm Swagger dekoratörlerinin doğru kullanım formatını gösteriyor. Dekoratör sıralama
kuralları da burada. Claude bu dosyaya bakarak doğru format'ı uyguluyor.

### prompts/response-examples.md (Örnek Değerler)
Response pattern'leri (tek kayıt, liste, auth, hata) ve property adlarına göre
gerçekçi örnek değerler tablosu. INCLUDE_EXAMPLES=true ise okunuyor.

### tools/scan_endpoints.py (Endpoint Tarayıcı)
Controller dosyasını parse edip yapılandırılmış JSON çıktı veriyor. Hangi endpoint'te
swagger var, hangisinde yok, hangi guard'lar kullanılıyor — hepsini rapor ediyor.

---

## Kullanım Örnekleri

### Controller Dokümantasyonu

```
"document the auth endpoints"
"add swagger docs to user controller"
"generate api docs for order.controller.ts"
```

### DTO Dokümantasyonu

```
"document DTOs in auth module"
"add swagger properties to CreateUserDto"
"add api documentation to my DTOs"
```

### Tam Modül Dokümantasyonu

```
"document everything in the order module"
"add full swagger docs to auth module"
"generate complete api documentation for user module"
```

### Minimal vs Detailed

```
# Sadece @ApiOperation + success response
"document auth endpoints minimal"

# Full dekoratörler + error responses + examples (varsayılan)
"document auth endpoints detailed"
```

---

## Konfigürasyon

SKILL.md'deki Variables bölümünü değiştirerek davranışı kontrol edebilirsin:

```markdown
## Variables

DEFAULT_SWAGGER_STYLE: detailed     ← "minimal" yaparsan sadece temel dekoratörler
INCLUDE_EXAMPLES: true              ← "false" yaparsan response örnekleri eklenmez
INCLUDE_ERROR_RESPONSES: true       ← "false" yaparsan hata response'ları eklenmez
ERROR_CODES: 400, 401, 403, 404, 409, 429, 500
```

---

## Tool Kullanımı (Manuel)

scan_endpoints.py'yi doğrudan da çalıştırabilirsin:

```bash
# Controller tara
python .claude/skills/api-doc-generator/tools/scan_endpoints.py controller src/auth/auth.controller.ts

# Modüldeki DTO'ları tara
python .claude/skills/api-doc-generator/tools/scan_endpoints.py dtos src/auth/
```

Örnek çıktı:

```json
{
  "file": "src/auth/auth.controller.ts",
  "controller": "AuthController",
  "path": "auth",
  "guards": [],
  "has_swagger_tags": false,
  "endpoints": [
    {
      "method": "POST",
      "path": "login",
      "function_name": "login",
      "parameters": [
        { "type": "Body", "name": "dto", "dto": "LoginDto" }
      ],
      "return_type": "LoginResponseDto",
      "guards": [],
      "has_swagger": false
    }
  ]
}
```

---

## Öğrenilen Skill Mimarisi Kavramları

Bu skill'i oluştururken öğrendiğin kavramlar:

| Kavram | Bu Skill'deki Karşılığı |
|--------|-------------------------|
| **Pivot Dosya** | SKILL.md — trigger, workflow, routing |
| **Progressive Disclosure** | 3 cookbook'tan sadece 1'i okunuyor |
| **IF/THEN Pattern** | "endpoints" → controller-docs, "DTOs" → dto-docs |
| **Variables** | INCLUDE_EXAMPLES, DEFAULT_SWAGGER_STYLE |
| **Separation of Concerns** | Her dosyanın tek sorumluluğu var |
| **Cookbook Pattern** | Her senaryo için izole talimat dosyası |
