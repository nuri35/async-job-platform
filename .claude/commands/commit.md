---
name: commit
description: Git commit and push with conventional commit format
---

## Git Commit & Push

1. Run `git status` to see changes
2. Run `git diff` to review what changed
3. Create commit message following project format:
   - `feat(module):` - new feature
   - `fix(module):` - bug fix
   - `refactor(module):` - code refactoring
   - `style(module):` - formatting, linting
   - `docs(module):` - documentation
   - `test(module):` - tests

4. Stage relevant files with `git add`
5. Commit with descriptive message (Turkish or English)
6. Push to remote

**Rules:**
- Atomic commits (one logical change per commit)
- Don't commit unrelated changes together
- Don't commit .env or sensitive files
- Always verify with `git status` after commit

If user says "push" or "push et", also run `git push` after commit.
