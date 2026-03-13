Session bitti. Aşağıdaki 3 adımı sırayla yap:

## 1. Plan Dosyalarını Güncelle

Bugün hangi plan dosyaları üzerinde çalışıldıysa:
- Kontrol listesindeki tamamlanan maddeleri `[x]` işaretle
- Tamamlanmayan maddeler `[ ]` kalsın
- Eğer plan tamamen bittiyse dosyanın başına `<!-- COMPLETED -->` ekle

## 2. CLAUDE.md Plan Tablosunu Güncelle

Root `CLAUDE.md` dosyasındaki plan tablosunu güncelle:
- Tamamlanan planları 📋 → ✅ olarak değiştir
- Yeni plan dosyası oluşturulduysa tabloya ekle
- Durum sütununu güncel tut

## 3. Memory'ye Kaydet

Şu bilgileri memory'ye kaydet:
- Bugün ne implement edildi (kısa, dosya adlarıyla)
- Sırada ne var (bir sonraki plan veya görev)
- Açık bug veya karar bekleyen konu varsa
- Bugün yapılan önemli mimari kararlar varsa

Format:
```
## [Tarih]
Implemented: [ne yapıldı]
Next: [sırada ne var]
Open: [varsa bug/karar]
Decision: [varsa mimari karar]
```

Her 3 adımı tamamla, sonra 4. adıma geç.

## 4. Yapısal Değişiklik Kontrolü

Bugün yapılan değişiklikleri tara ve şu dosyaları güncellenmesi gerekip gerekmediğine karar ver:

**Root CLAUDE.md:**
- Yeni modül eklendiyse → Yapı bölümüne ekle
- Yeni MCP bağlandıysa → MCP bölümüne ekle
- Yeni skill/agent/command oluşturulduysa → Tooling bölümüne ekle
- Tech stack değiştiyse (yeni paket, yeni servis) → Stack bölümüne ekle
- Yeni komut eklendiyse → Komutlar bölümüne ekle

**`.claude/rules/security-rules.md`:**
- Yeni auth pattern eklendiyse (yeni guard, yeni exception, yeni validation)
- Redis'te yeni security key pattern oluşturulduysa
- Enumeration protection değiştiyse
- Paths frontmatter güncellenmesi gerekiyorsa (yeni dosya yolları)

**`.claude/rules/rabbitmq-rules.md`:**
- Yeni queue eklendiyse
- Yeni routing key eklendiyse
- Exchange topology değiştiyse
- Consumer pattern değiştiyse
- Paths frontmatter güncellenmesi gerekiyorsa

**`modules/auth/CLAUDE.md`:**
- Yeni service eklendiyse → dosya yapısına ekle
- Yeni Redis key pattern eklendiyse → key patterns bölümüne ekle
- Rate limiting constant değiştiyse → constants bölümüne yansıt
- Auth flow değiştiyse → flow bölümünü güncelle
- Yeni guard/decorator eklendiyse → yapıya ekle

**Karar kuralı:** Değişiklik yoksa dosyaya DOKUNMA. Değişiklik varsa sadece ilgili bölümü güncelle, geri kalanına dokunma. Aynı bilgiyi birden fazla dosyaya YAZMA — her bilgi tek yerde yaşar.

Tüm adımları tamamladıktan sonra kısa özet göster:
- Güncellenen plan dosyaları
- CLAUDE.md'de değişen satırlar
- Memory'ye kaydedilen bilgiler
- Yapısal güncelleme yapılan dosyalar (veya "Yapısal değişiklik yok")