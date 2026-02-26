# Output Template & Tone Guide

## Language Rules

- **ALL prose must be in Turkish**
- Technical terms stay in English: service, guard, entity, DTO, module, controller, middleware, interceptor, pipe, repository, migration, schema, endpoint, dependency, queue, worker
- Commit messages stay as-is (English)
- File paths and code stay as-is

## Tone Rules

You are a **senior mentor** explaining to a colleague what happened while they were away. Follow these principles:

1. **Give context, not just facts**: Don't say "auth.service.ts değişti." Say "Auth modülündeki service'e JWT refresh token mekanizması eklenmiş. Bu önemli çünkü kullanıcılar artık her 15 dakikada bir yeniden login olmak zorunda kalmayacak."

2. **Connect the dots**: Show how commits relate to each other. "Önce user entity'ye role field'ı eklenmiş, sonra buna bağlı olarak RBAC guard'ı yazılmış, son olarak da admin-only endpoint'ler bu guard ile korunmuş."

3. **Be conversational**: Write like you're talking to the developer over coffee, not writing a report.

4. **Highlight what matters**: Not all commits are equal. A new module creation deserves more explanation than a typo fix.

5. **Don't be boring**: Avoid dry lists. Weave a narrative.

## Markdown Template

Use this exact structure for the output file:

```markdown
# 🔄 Backend Recap — {start_date} → {end_date}

> **Branch:** {branch_name}
> **Analiz edilen süre:** Son {N} gün
> **Toplam backend commit:** {count}
> **En aktif alan:** {most_active_module}

---

## 📍 Tam Olarak Nerede Kaldın?

{3-5 sentences. Mentor tone. Summarize the BIG PICTURE.
What was the main focus? What stage is it at? What was the last
meaningful thing completed? Where does the project stand NOW?}

**Son commit:** `{hash}` — {message} ({relative_date})

---

## 🏗️ Yapılan Çalışmalar

{Only include categories that have commits. Skip empty categories entirely.}

### ✨ Yeni Özellikler

#### {Module/Feature Name}

{2-3 sentences explaining WHAT this feature is and WHY it exists.
Connect the commits into a narrative.}

- `{hash}` — {message}
  - {file1} ✏️, {file2} 🆕
  - {1-sentence explanation}

- `{hash}` — {message}
  - ...

---

### 🐛 Bug Fix'ler

#### {Module Name}

{Explain what was broken and how it was fixed}

- `{hash}` — {message}
  - ...

---

### ♻️ Refaktörler

{Explain the motivation behind the refactoring}

---

### ⚙️ Konfigürasyon & Altyapı

{Docker, CI/CD, env, package.json, tsconfig changes}

---

### 🗃️ Veritabanı Değişiklikleri

{Schema changes, migrations, seeds — explain the data model evolution}

---

### 🧪 Testler

{New tests, what they cover, any test infrastructure changes}

---

## 📦 Yeni Bağımlılıklar

{Skip this section entirely if no new deps. Show as table:}

| Paket | Versiyon | Açıklama |
|-------|----------|----------|
| {name} | {ver} | {what it does and why it was added} |

---

## 🗺️ Dosya Haritası

{Show ONLY changed files in a tree view with status indicators}

```
src/
├── auth/                    (N dosya)
│   ├── auth.service.ts      ✏️
│   ├── auth.guard.ts        🆕
│   └── dto/
│       └── login.dto.ts     ✏️
├── jobs/                    (N dosya)
│   ├── jobs.module.ts       🆕
│   ├── jobs.service.ts      🆕
│   └── processors/
│       └── email.processor.ts 🆕
prisma/
└── schema.prisma            ✏️
```

🆕 Yeni | ✏️ Değiştirildi | 🗑️ Silindi

---

## ⏭️ Sonraki Adımlar

{Based on analysis, suggest what to do next. Be specific and actionable.}

1. **{Action}** — {Why: specific evidence from the code}
2. **{Action}** — {Why}
3. **{Action}** — {Why}

{If TODOs/FIXMEs found, list them:}

**Koddaki TODO'lar:**
- `{file}:{line}` — {TODO content}

---

## 📊 İstatistikler

| Metrik | Değer |
|--------|-------|
| Toplam commit | {n} |
| Eklenen satır | +{n} |
| Silinen satır | -{n} |
| Yeni dosya | {n} |
| Değiştirilen dosya | {n} |
| Silinen dosya | {n} |
| En çok değişen dosya | `{file}` ({n} commit) |
| En aktif modül | {module} ({n} commit) |
```

## Formatting Rules

- Use emoji sparingly — only in section headers as shown above
- Keep tables clean and aligned
- Use inline code backticks for all file names, hashes, and technical terms
- Bold important points in narrative sections
- Tree view must reflect ACTUAL project structure, not a generic template