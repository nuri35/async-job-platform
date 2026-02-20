---
model: opus
description: Comprehensive review of a NestJS module - checks architecture, validation, Swagger docs, and best practices
argument-hint: [module-name]
allowed-tools: Glob, Grep, Read, Bash
---

# Purpose

Perform a comprehensive code review of the **$1** module.

## Checklist

### Architecture
- [ ] Business logic only in services, not controllers
- [ ] Repository pattern used for database access
- [ ] No circular dependencies between modules
- [ ] Single Responsibility — each service method does one thing
- [ ] Dependency Injection used properly (no `new Service()`)

### DTOs & Validation
- [ ] Every endpoint input has a DTO
- [ ] Every DTO property has class-validator decorators
- [ ] Optional fields marked with @IsOptional() and `?`
- [ ] Nested objects use @ValidateNested + @Type
- [ ] No magic strings/numbers — use enums and constants

### Swagger Documentation
- [ ] @ApiTags on controller class
- [ ] @ApiOperation on every method with summary
- [ ] @ApiResponse for success (2xx) AND error (4xx) cases
- [ ] @ApiProperty on every DTO property with description
- [ ] Response DTOs documented in @ApiResponse

### Error Handling
- [ ] Custom exception classes used (not raw HttpException)
- [ ] Proper HTTP status codes for each error type
- [ ] Error messages are user-friendly
- [ ] No leaked internal details in error responses

### Security
- [ ] Auth guards on protected endpoints
- [ ] Input sanitization where needed
- [ ] No hardcoded secrets or credentials

### Naming Conventions
- [ ] Files: kebab-case (create-job.dto.ts)
- [ ] Classes: PascalCase (CreateJobDto)
- [ ] Routes: kebab-case (/async-jobs)
- [ ] Methods: camelCase (createJob)
- [ ] Constants: UPPER_SNAKE_CASE

## Report Format

For each category, report:
- ✅ Passing checks
- ❌ Failing checks with specific file, line, and fix suggestion
- Overall health score: X/10