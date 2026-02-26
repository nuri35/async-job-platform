# Project Detection

Before filtering git history, you MUST understand the project structure. Do not assume anything.

## Commands to Run

```bash
# 1. Project root
PROJECT_ROOT=$(git rev-parse --show-toplevel)
cd "$PROJECT_ROOT"

# 2. Current branch and last commit
git branch --show-current
git log -1 --format="%h — %s (%ci)"

# 3. Detect framework
cat package.json 2>/dev/null | grep -E '"@nestjs|express|fastify|hapi|koa"'

# 4. Detect ORM
cat package.json 2>/dev/null | grep -E '"prisma|@prisma|typeorm|sequelize|drizzle|mongoose|knex"'

# 5. Detect test framework
cat package.json 2>/dev/null | grep -E '"jest|vitest|mocha|chai"'

# 6. Source folder structure (2 levels deep, ignore node_modules)
find src/ -maxdepth 2 -type d 2>/dev/null | head -30

# 7. Check for monorepo apps/packages
ls -d apps/* packages/* 2>/dev/null
```

## What to Record

After running these commands, note:

| Property | Example | Why It Matters |
|----------|---------|----------------|
| Framework | NestJS | Determines module/service/controller patterns |
| ORM | Prisma | Determines DB-related file paths to track |
| Source root | `src/` or `apps/backend/src/` | Base path for filtering |
| Test location | `test/`, `__tests__/`, `*.spec.ts` | Include test files in recap |
| Monorepo? | Yes/No | If yes, ask user which app to analyze |

## Monorepo Handling

If the project is a monorepo (multiple `apps/` or `packages/`):
- List all available apps/packages to the user
- Ask which one to analyze
- Adjust ALL path filters to that specific app's directory

## Output

Pass the detected configuration to the next step (git-filters) so it can adapt paths accordingly.