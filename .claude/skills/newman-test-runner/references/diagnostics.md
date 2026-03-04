# Hata Diagnostik Tablosu

Bu dosyayı sadece test fail olduğunda oku. Newman sonuçlarındaki hata tipine göre root cause analizi yap.

## HTTP Status Code Hataları

### Status 500, beklenen 400/422
**Olası Sebep:** ValidationPipe eksik veya exception handler yok
**Kontrol Et:**
- `main.ts` → `app.useGlobalPipes(new ValidationPipe())` var mı?
- `HttpExceptionFilter` global olarak ekli mi?
- DTO'daki decorator'lar doğru mu? (`@IsEmail()`, `@IsNotEmpty()` vb.)
**Fix:** main.ts'e ValidationPipe ekle veya DTO decorator'larını kontrol et

### Status 401
**Olası Sebep:** JWT token eksik, expired veya geçersiz
**Kontrol Et:**
- Authorization header'da `Bearer <token>` formatı doğru mu?
- Token expired mı? (jwt.io'da kontrol et)
- JwtStrategy'deki secret doğru mu?
- Token blacklist'te mi? (Redis `blacklist:jwt:{jti}` kontrol et)
**Fix:** Önce login yapıp yeni token al, sonra test et

### Status 403
**Olası Sebep:** Guard reject ediyor, rol yetersiz
**Kontrol Et:**
- Endpoint'teki `@Roles()` decorator'ı hangi rol istiyor?
- Token'daki role claim doğru mu?
- Guard doğru endpoint'e uygulanmış mı?
**Fix:** Token'daki role'ü kontrol et veya guard konfigürasyonunu incele

### Status 404
**Olası Sebep:** Route tanımlı değil veya yanlış path
**Kontrol Et:**
- Controller'daki `@Controller('path')` doğru mu?
- Method decorator (`@Post()`, `@Get()`) path'i doğru mu?
- Module'de controller import edilmiş mi?
- Global prefix var mı? (`api/v1` gibi)
**Fix:** Controller route path'ini kontrol et, Postman'deki URL ile karşılaştır

### Status 429
**Olası Sebep:** Rate limiting devrede
**Kontrol Et:**
- Hangi rate limit? (login, register, IP-based)
- Redis'teki counter key'lerini kontrol et
- TTL ne kadar? Bekle ve tekrar dene
**Fix:** Rate limit süresi dolmasını bekle veya Redis'ten counter'ı sil (sadece development)

## Connection Hataları

### Connection refused (ECONNREFUSED)
**Olası Sebep:** Backend ayakta değil
**Kontrol Et:** 
- `npm run start:dev` çalışıyor mu?
- Doğru port mu? (3000 vs başka port)
- Port başka process tarafından kullanılıyor mu?
**Fix:** Backend'i başlat: `npm run start:dev`

### ETIMEDOUT
**Olası Sebep:** Endpoint çok yavaş veya sonsuz döngü
**Kontrol Et:**
- Service'deki async operasyonlar await edilmiş mi?
- DB sorgusu çok mu uzun sürüyor?
- External API çağrısı timeout mu oluyor?
**Fix:** Service'deki async operasyonları ve DB sorgularını kontrol et

### ECONNRESET
**Olası Sebep:** Backend crash olmuş
**Kontrol Et:**
- Backend terminal'inde error log var mı?
- Unhandled promise rejection var mı?
- Memory overflow mı?
**Fix:** Backend loglarını kontrol et, crash sebebini bul

## Response Parse Hataları

### JSONError / SyntaxError: Unexpected token
**Olası Sebep:** Response body JSON değil
**Kontrol Et:**
- Response interceptor çalışıyor mu?
- HTML error page mi dönüyor? (Fastify default error)
- Content-Type header'ı `application/json` mı?
**Fix:** Response interceptor ve error handler kontrol et

### TypeError: Cannot read property 'X' of undefined
**Olası Sebep:** Response body beklenmeyen formatta
**Kontrol Et:**
- Response DTO doğru mu?
- Service null/undefined dönüyor mu?
- Nested property eksik mi?
**Fix:** Service return değerini ve response DTO'yu kontrol et

## Assertion Hataları

### AssertionError: expected X to equal Y
**Olası Sebep:** Response beklenen değeri döndürmüyor
**Kontrol Et:**
- Collection'daki test script doğru mu?
- Response formatı değişmiş mi?
- Enumeration koruması mı? (register/login aynı mesaj döner)
**Fix:** Beklenen değeri güncel response ile karşılaştır

### AssertionError: expected status code
**Olası Sebep:** Endpoint farklı status code dönüyor
**Kontrol Et:**
- Controller'daki `@HttpCode()` decorator doğru mu?
- NestJS default status code nedir? (POST → 201, diğerleri → 200)
- Exception filter status code'u değiştiriyor mu?
**Fix:** Controller'daki HttpCode decorator'ını veya exception filter'ı kontrol et

## NestJS Özel Durumlar

### class-validator hataları gelmiyor (body boş gönderilince 500)
`main.ts`'de ValidationPipe ayarları:
```typescript
app.useGlobalPipes(new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
}));
```

### @Transform çalışmıyor (email lowercase olmuyor)
DTO'da `transform: true` aktif mi kontrol et (yukarıdaki ValidationPipe ayarı).
`@Transform(({ value }) => value?.toLowerCase().trim())` doğru syntax mi?

### Guard before Pipe çalışıyor (validation'dan önce auth check)
NestJS execution order: Middleware → Guard → Interceptor → Pipe → Handler.
Guard'ın public endpoint'lerde bypass edildiğini kontrol et.