# Purpose

Document an entire NestJS module — controllers, DTOs, and Swagger setup.
This cookbook orchestrates the other cookbooks in sequence.

## Instructions

### Step 1: Discover Module Files

- Scan the target module directory: `src/<module-name>/`
- Identify all files:
  - Controllers: `*.controller.ts`
  - DTOs: `*.dto.ts` (check `dto/` and `dtos/` subdirectories too)
  - Entities: `*.entity.ts` (for reference, not for direct documentation)

### Step 2: Document Controllers First

- Follow ALL instructions from `cookbook/controller-docs.md`
- Apply to every controller found in the module
- This ensures endpoint-level documentation is complete before DTO work

### Step 3: Document DTOs

- Follow ALL instructions from `cookbook/dto-docs.md`
- Apply to every DTO found in the module
- Include both request DTOs (CreateXDto, UpdateXDto) and response DTOs

### Step 4: Verify SwaggerModule Setup in main.ts

- Check if `main.ts` has SwaggerModule configured
- If NOT configured, add the following setup:

```typescript
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

// Inside bootstrap() function, before app.listen():
const config = new DocumentBuilder()
  .setTitle('API Documentation')
  .setDescription('Auto-generated API documentation')
  .setVersion('1.0')
  .addBearerAuth()
  .build();

const document = SwaggerModule.createDocument(app, config);
SwaggerModule.setup('api/docs', app, document);
```

- If already configured, verify `.addBearerAuth()` is present (needed for @ApiBearerAuth endpoints)

### Step 5: Summary Report

After completing all documentation, provide a summary:

```
Module: <module-name>
Controllers documented: <count>
Endpoints documented: <count>
DTOs documented: <count>
Properties documented: <count>
SwaggerModule setup: <verified/added>
Swagger UI available at: /api/docs
```

## Important Notes

- Do NOT modify entity files — entities are for Prisma/TypeORM, not Swagger
- If a DTO is shared across modules, only document it once
- If response DTOs don't exist, suggest creating them (don't use entities as response types)
