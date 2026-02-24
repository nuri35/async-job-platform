---
name: API Documentation Generator
description: Generate Swagger/OpenAPI documentation for NestJS endpoints. Use this when the user requests 'document endpoints', 'add swagger docs', 'generate api docs', 'document the <module> module', 'document DTOs', or 'add api documentation'.
---

# Purpose

Automatically generate Swagger/OpenAPI documentation for NestJS controllers, DTOs, and full modules.
Adds proper decorators, response types, examples, and error responses following best practices.

Follow the `Instructions`, execute the `Workflow`, based on the `Cookbook`.

## Variables

DEFAULT_SWAGGER_STYLE: detailed
INCLUDE_EXAMPLES: true
INCLUDE_ERROR_RESPONSES: true
ERROR_CODES: 400, 401, 403, 404, 409, 429, 500
SUPPORTED_HTTP_METHODS: GET, POST, PUT, PATCH, DELETE

## Instructions

- Based on the user's request, follow the `Cookbook` to determine which documentation type to generate.
- Always check if Swagger decorators already exist before adding new ones — avoid duplicates.
- Preserve existing code structure and formatting.
- Add necessary imports at the top of the file if missing (`@nestjs/swagger`).
- If the user specifies a module name, look for files in `src/<module-name>/` directory.
- If the user says "minimal", set SWAGGER_STYLE to minimal (only @ApiOperation + @ApiResponse for success).
- If the user says "detailed", set SWAGGER_STYLE to detailed (full decorators with examples and error responses).

### Import Management

- ALWAYS check existing imports before adding new ones.
- Required imports from `@nestjs/swagger`:
  - Controller docs: `ApiTags, ApiOperation, ApiResponse, ApiBody, ApiParam, ApiQuery, ApiBearerAuth`
  - DTO docs: `ApiProperty, ApiPropertyOptional`
- Do NOT add duplicate imports. Merge with existing import statements.

## Workflow

1. Understand the user's request — which module? which files? what type of docs?
2. READ: `.claude/skills/api-doc-generator/tools/scan_endpoints.py` to understand our scanning tool.
3. Follow the `Cookbook` to determine which documentation type to generate.
4. READ: relevant prompt templates from `.claude/skills/api-doc-generator/prompts/` for correct formatting.
5. Apply decorators to the target files.
6. Verify imports are correct and complete.

## Cookbook

### Controller Endpoints

- IF: The user requests documentation for endpoints, controllers, or routes.
- THEN: Read and execute: `.claude/skills/api-doc-generator/cookbook/controller-docs.md`
- EXAMPLES:
  - "document the auth endpoints"
  - "add swagger docs to user controller"
  - "generate api docs for order.controller.ts"
  - "document routes in payment module"

### DTO Documentation

- IF: The user requests documentation for DTOs, request/response bodies, or validation.
- THEN: Read and execute: `.claude/skills/api-doc-generator/cookbook/dto-docs.md`
- EXAMPLES:
  - "document DTOs in auth module"
  - "add swagger properties to CreateUserDto"
  - "add api documentation to my DTOs"
  - "document request bodies"

### Full Module Documentation

- IF: The user requests documentation for an entire module or says "document everything".
- THEN: Read and execute: `.claude/skills/api-doc-generator/cookbook/full-module-docs.md`
- EXAMPLES:
  - "document everything in the order module"
  - "add full swagger docs to auth module"
  - "generate complete api documentation for user module"
  - "document the entire payment module"
