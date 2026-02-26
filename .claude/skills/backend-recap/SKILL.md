---
name: backend-recap
description: Backend git history analysis and Turkish recap generation. Contains reference files for project detection, git filtering, commit analysis, and output templating. Triggered by /backend-recap command. Do NOT auto-trigger — this skill is only used when explicitly invoked by the backend-recap command.
disable-model-invocation: true
---

# Backend Recap Skill

This skill provides reference files for the `/backend-recap` command. It is NOT meant to be triggered automatically.

## Reference Files

Each file handles one responsibility. The command orchestrator loads them step by step.

| File | Purpose | When to Read |
|------|---------|--------------|
| `references/project-detection.md` | Detect project framework, ORM, folder structure | Step 1 — Always first |
| `references/git-filters.md` | 3-layer backend commit filtering strategy | Step 2 — After project detection |
| `references/analysis-rules.md` | Commit grouping, categorization, extra checks | Step 3 — After extraction |
| `references/output-template.md` | Turkish recap markdown template and tone rules | Step 4 — When generating output |

## Flow

```
/backend-recap [days]
       │
       ▼
  Command (orchestrator)
       │
       ├──► project-detection.md  →  understand the codebase
       ├──► git-filters.md        →  extract backend commits only
       ├──► analysis-rules.md     →  categorize and group
       └──► output-template.md    →  generate Turkish recap
                                           │
                                           ▼
                                  .recaps/backend-recap-{date}.md
```