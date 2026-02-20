---
model: opus
description: Scaffold a complete NestJS module with entity, DTOs, service, controller, and module registration
argument-hint: [module-name]
allowed-tools: Glob, Grep, Read, Edit, Write, Bash
hooks:
  PostToolUse:
    - matcher: "Write|Edit"
      hooks:
        - type: command
          command: "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/validators/dto-validator.js\""
          timeout: 5
        - type: command
          command: "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/validators/swagger-validator.js\""
          timeout: 5
  Stop:
    - matcher: ""
      hooks:
        - type: command
          command: "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/validators/build-validator.js\""
          timeout: 30
---

# Purpose

Scaffold a complete **$1** module with all NestJS layers.

## Workflow

1. **Create directory** — `apps/api/src/$1/`
2. **Entity** — Create `$1.entity.ts` with TypeORM decorators
3. **DTOs** — Create `dto/create-$1.dto.ts` and `dto/update-$1.dto.ts` with validation
4. **Repository** — Create `$1.repository.ts` (if using repository pattern)
5. **Service** — Create `$1.service.ts` with CRUD methods
6. **Controller** — Create `$1.controller.ts` with Swagger docs and all CRUD endpoints
7. **Module** — Create `$1.module.ts` registering everything
8. **App Module** — Import new module in `app.module.ts`
9. **Verify** — TypeScript compilation

## File Structure

```
apps/api/src/$1/
├── dto/
│   ├── create-$1.dto.ts
│   └── update-$1.dto.ts
├── $1.entity.ts
├── $1.repository.ts
├── $1.service.ts
├── $1.controller.ts
└── $1.module.ts
```

## Rules

- Follow existing project patterns (check other modules first)
- All DTOs must have class-validator + @ApiProperty
- Controller must have full Swagger decorators
- Service handles all business logic
- Entity uses TypeORM decorators with proper column types