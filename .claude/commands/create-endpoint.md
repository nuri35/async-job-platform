---
model: opus
description: Create a new REST endpoint with full NestJS patterns including Swagger docs, DTO validation, and clean architecture
argument-hint: [module] [endpoint-description]
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
        - type: command
          command: "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/validators/controller-validator.js\""
          timeout: 5
  Stop:
    - matcher: ""
      hooks:
        - type: command
          command: "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/validators/build-validator.js\""
          timeout: 30
        - type: command
          command: "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/validators/module-validator.js\""
          timeout: 10
---

# Purpose

Create a new REST endpoint in the **$1** module.

## Requirements

$2

## Workflow

1. **Analyze** — Read existing module structure in `apps/api/src/$1/`
2. **DTO** — Create request/response DTOs with full class-validator decorators and @ApiProperty descriptions
3. **Service** — Add business logic method in the service layer
4. **Controller** — Add endpoint method with Swagger decorators (@ApiOperation, @ApiResponse, @ApiTags)
5. **Module** — Ensure controller and service are registered in the module
6. **Verify** — Confirm TypeScript compilation passes

## Rules

- Business logic ONLY in services, never in controllers
- Every input uses a DTO with class-validator decorators
- Every endpoint has full Swagger documentation
- Use custom exceptions, not raw HttpException
- Repository pattern for database operations
- Early returns, no deep nesting
- Kebab-case route naming

## Report

After completion, report:
- Files created/modified
- Endpoint path and HTTP method
- DTO fields and validations applied
- Swagger documentation summary