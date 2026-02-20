---
model: sonnet
description: Audit all Swagger documentation across the project and report missing decorators
allowed-tools: Glob, Grep, Read, Bash
hooks:
  Stop:
    - matcher: ""
      hooks:
        - type: command
          command: "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/validators/swagger-validator.js\" --full-audit"
          timeout: 15
---

# Purpose

Audit the entire project for Swagger documentation completeness.

## Workflow

1. **Find controllers** — Glob all `*.controller.ts` files
2. **Check each method** for:
   - @ApiTags on the controller class
   - @ApiOperation with summary on every route method
   - @ApiResponse with success (2xx) and error (4xx) status codes
3. **Find DTOs** — Glob all `*.dto.ts` files
4. **Check each property** for:
   - @ApiProperty with description field
   - @ApiProperty with example field (recommended)
5. **Generate report** with:
   - Coverage percentage per file
   - List of missing decorators with file and line
   - Prioritized fix recommendations

## Report Format

```
SWAGGER AUDIT REPORT
====================

Overall Coverage: XX%

Controllers:
  ✅ jobs.controller.ts — 100% (5/5 methods documented)
  ❌ auth.controller.ts — 60% (3/5 methods documented)
     - Missing: @ApiOperation on login()
     - Missing: @ApiResponse(400) on register()

DTOs:
  ✅ create-job.dto.ts — 100% (4/4 properties documented)
  ❌ update-user.dto.ts — 75% (3/4 properties documented)
     - Missing: @ApiProperty description on "avatar"

Priority Fixes:
1. auth.controller.ts — 2 missing decorators
2. update-user.dto.ts — 1 missing decorator
```