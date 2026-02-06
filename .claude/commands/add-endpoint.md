---
name: add-endpoint
description: Create a new REST endpoint with controller, DTO, service method, and Swagger docs
---

## Add New Endpoint

Ask the user for:
1. **Module** - which module? (auth, jobs, etc.)
2. **HTTP Method** - GET, POST, PUT, DELETE, PATCH
3. **Path** - endpoint path (e.g., /forgot-password)
4. **Purpose** - what should it do?

Then create:

### 1. DTO (if needed)
- Request DTO with `class-validator` decorators
- Response DTO for type safety
- Location: `modules/{module}/dto/`

### 2. Controller Method
```typescript
@Post('path')
@ApiOperation({ summary: 'Description' })
@ApiResponse({ status: 201, description: 'Success', type: ResponseDto })
@ApiResponse({ status: 400, description: 'Bad Request' })
async methodName(@Body() dto: RequestDto): Promise<ResponseDto> {
  return this.service.method(dto);
}
```

### 3. Service Method
- Business logic in service
- Proper error handling with custom exceptions
- Return typed response

### 4. Swagger
- `@ApiOperation` with summary
- `@ApiResponse` for success and error cases
- `@ApiTags` on controller (if new controller)

**Follow existing patterns in the codebase. Check similar endpoints first.**
