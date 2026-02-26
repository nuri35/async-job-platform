# Git Filtering — 3-Layer Backend Isolation

Use ALL three layers together to ensure only backend changes are captured.

## Layer 1 — Path Include List

Track changes in these directories (adapt to detected project structure):

```
src/          server/       api/          lib/
prisma/       migrations/   config/       scripts/
test/         __tests__/    seeders/      database/
```

## Layer 2 — Extension Rules

**Include these extensions:**
```
.ts  .js  .prisma  .sql  .env  .json  .yml  .yaml
```

**Exclude these extensions (frontend):**
```
.tsx  .jsx  .css  .scss  .sass  .less  .svg  .png  .jpg  .ico  .html  .vue
```

## Layer 3 — Commit Message Categories

Map prefixes to categories for grouping in the recap:

| Prefix | Category |
|--------|----------|
| `feat:` | ✨ Yeni Özellik |
| `fix:` | 🐛 Bug Fix |
| `refactor:` | ♻️ Refaktör |
| `chore:` | ⚙️ Konfigürasyon |
| `test:` | 🧪 Test |
| `docs:` | 📝 Dokümantasyon |
| `perf:` | ⚡ Performans |
| `ci:` | 🔧 CI/CD |
| `db:` / `migration:` | 🗃️ Veritabanı |
| No prefix / other | 📦 Diğer |

## Primary Git Command

```bash
DAYS=7  # from $ARGUMENTS or default

git log \
  --no-merges \
  --since="${DAYS} days ago" \
  --pretty=format:"COMMIT_START%n%H|||%h|||%s|||%an|||%ci" \
  --name-status \
  -- \
  'src/**/*.ts' 'src/**/*.js' \
  'prisma/**' 'migrations/**' 'database/**' \
  'config/**' 'scripts/**' \
  'test/**' '__tests__/**' \
  '*.ts' '*.js' '*.prisma' '*.sql' \
  'package.json' 'tsconfig.json' 'nest-cli.json' \
  'docker-compose*.yml' 'Dockerfile*' \
  '.env*' \
  ':!**/*.tsx' ':!**/*.jsx' ':!**/*.css' ':!**/*.scss' ':!**/*.svg' \
  ':!**/components/**' ':!**/pages/**/*.tsx' ':!**/app/**/*.tsx'
```

> **IMPORTANT:** Adapt the paths above based on what project-detection found.
> For example, if source is in `apps/backend/src/`, adjust accordingly.

## Supplementary Commands

Run these AFTER the primary command:

```bash
# Newly created files
git log --no-merges --since="${DAYS} days ago" --diff-filter=A \
  --name-only --pretty=format:"" -- <same filters> | sort -u

# Deleted files
git log --no-merges --since="${DAYS} days ago" --diff-filter=D \
  --name-only --pretty=format:"" -- <same filters> | sort -u

# Overall line stats
git diff --stat $(git log --since="${DAYS} days ago" --format="%H" | tail -1)..HEAD \
  -- <same filters>

# Package.json diff for new dependencies
git diff $(git log --since="${DAYS} days ago" --format="%H" | tail -1)..HEAD \
  -- package.json | grep "^\+" | grep -v "+++"
```

## Edge Cases

- **No commits found:** Tell the user, suggest increasing the day range
- **All commits are merges:** Remove `--no-merges` flag and note this
- **Non-conventional commit messages:** Skip Layer 3, categorize by file paths instead (e.g., files in `prisma/` → Database, files in `test/` → Test)