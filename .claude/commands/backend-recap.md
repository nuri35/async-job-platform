---
description: Analyze git history for backend-only changes and generate a detailed Turkish recap. Use when returning to backend work after a break.
argument-hint: [days]
---

# Backend Recap

You are helping a developer get back up to speed after a break from backend work.

**DAYS parameter:** $ARGUMENTS (default: 7 if not provided)

## Workflow

Follow these steps IN ORDER. At each step, read the referenced file BEFORE executing.

### Step 1 — Detect Project Structure
Read `~/.claude/skills/backend-recap/references/project-detection.md` and follow its instructions to understand the project layout.

### Step 2 — Extract Backend Commits
Read `~/.claude/skills/backend-recap/references/git-filters.md` and apply its 3-layer filtering strategy to extract only backend-related commits from the last $ARGUMENTS days.

### Step 3 — Analyze & Categorize
Read `~/.claude/skills/backend-recap/references/analysis-rules.md` and use its grouping/categorization logic on the extracted commits.

### Step 4 — Generate Recap File
Read `~/.claude/skills/backend-recap/references/output-template.md` and generate the Turkish recap markdown following its exact structure and tone guidelines.

### Step 5 — Save
Save the output to `.recaps/backend-recap-{YYYY-MM-DD}.md` in the project root. Create `.recaps/` if it doesn't exist. Add `.recaps/` to `.gitignore` if missing.

Present the saved file path to the user.