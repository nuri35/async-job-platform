---
description: Enriches the prompt using the prompt-engineer subagent before implementation
---

## Instructions

Use the **prompt-engineer** subagent to enrich the following developer prompt before writing any code.

### Stack Context for Subagent
- Backend: NestJS + TypeScript (monorepo)
- ORM: Prisma + PostgreSQL
- Queue: BullMQ + Redis + RabbitMQ
- Patterns: Repository pattern, DTOs with class-validator, Guards, Interceptors
- Testing: Jest
- Principles: SOLID, Clean Code, Early Returns, No Magic Strings

### What the Subagent Should Do
1. Identify ambiguous or missing details in the prompt
2. Suggest NestJS module structure (new or existing module?)
3. List required files (Controller, Service, DTO, Entity, Module)
4. Identify edge cases and error scenarios
5. Add security and validation requirements
6. Suggest performance and scalability considerations

### Rules
- The subagent should ONLY ANALYZE and ENRICH, NOT write code
- After receiving the subagent output, YOU write the production-ready code
- If architecture decisions are needed, ASK the user first
- Turkish explanations, English code

### Flow
```
1. prompt-engineer subagent → analyzes and enriches the prompt
2. You → evaluate subagent output
3. You → ask user if architecture decisions needed
4. You → write production-ready code with enriched context
```

## Developer Prompt
$ARGUMENTS