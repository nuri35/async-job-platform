# Analysis & Categorization Rules

After extracting raw commits, apply these rules to produce meaningful insights.

## Grouping Hierarchy

Organize commits in this structure:

```
Category (Feature / Fix / Refactor / Config / DB / Test)
  └── Module or Feature Area (auth, jobs, users, queue, etc.)
      └── Individual commits
          ├── Hash + message
          ├── Changed files (with A/M/D status)
          └── Brief explanation of what was done
```

## Module Detection

Infer modules from file paths:

| Path Pattern | Module |
|-------------|--------|
| `src/auth/**` | Auth |
| `src/users/**` | Users |
| `src/jobs/**` or `src/queue/**` | Jobs / Queue |
| `src/common/**` or `src/shared/**` | Shared / Common |
| `prisma/**` or `migrations/**` | Database |
| `config/**` | Configuration |
| `test/**` or `**/*.spec.ts` | Testing |
| `src/{other}/**` | Use folder name as module |

## Per-Commit Analysis

For each commit, determine:

1. **What changed?** — List files with change type (Added 🆕 / Modified ✏️ / Deleted 🗑️)
2. **Why?** — Infer purpose from commit message + file names
3. **Impact** — Which module(s) affected, how many files, lines added/removed
4. **Connection** — How does this commit relate to others in the same module?

## Extra Checks

Run these additional analyses when relevant:

### Prisma / Database Changes
```bash
# Check if schema changed
git diff --name-only $(git log --since="${DAYS} days ago" --format="%H" | tail -1)..HEAD \
  -- 'prisma/schema.prisma'

# Check pending migrations
npx prisma migrate status 2>/dev/null
```
If schema changed → note new models, new fields, relation changes.

### New Dependencies
If `package.json` changed, extract and describe new packages:
- Package name and version
- Brief description of what it does (use your knowledge)
- Why it was likely added (infer from other commits)

### TODO / FIXME Detection
```bash
# Find TODOs in recently changed files
git diff --name-only $(git log --since="${DAYS} days ago" --format="%H" | tail -1)..HEAD \
  -- '*.ts' '*.js' | xargs grep -n "TODO\|FIXME\|HACK\|XXX" 2>/dev/null
```

### Incomplete Work Detection
Look for signals of unfinished work:
- Services without corresponding controllers
- Empty or stub test files
- Commented-out code blocks
- `// TODO` comments in recent files
- Migration files without corresponding service changes

## Statistics to Calculate

| Metric | How |
|--------|-----|
| Total commits | Count from git log |
| Lines added | From `git diff --stat` (+ lines) |
| Lines removed | From `git diff --stat` (- lines) |
| New files | Count from `--diff-filter=A` |
| Modified files | Count from `--diff-filter=M` |
| Deleted files | Count from `--diff-filter=D` |
| Most changed file | File appearing in most commits |
| Most active module | Module with most commits |

## Next Steps Inference

Based on analysis, suggest 3-5 probable next actions:
- Unfinished features (commits that add partial functionality)
- Missing tests for new code
- TODOs and FIXMEs found
- Schema changes without corresponding API endpoints
- New services without documentation