# Swagger Decorator Reference

This is a format reference. Use these patterns when adding decorators.

## Controller-Level Decorators

```typescript
// Tag the controller — use kebab-case module name
@ApiTags('auth')

// Mark as requiring authentication — only if controller has auth guards
@ApiBearerAuth()
```

## Endpoint-Level Decorators

### @ApiOperation — What does this endpoint do?

```typescript
@ApiOperation({
  summary: 'Short description (max 10 words)',
  description: 'Detailed explanation. What it does, what it returns, any side effects.',
})
```

### @ApiBody — What goes in the request body?

```typescript
// Simple DTO reference
@ApiBody({ type: CreateUserDto })

// With description
@ApiBody({
  type: CreateUserDto,
  description: 'User registration data',
})
```

### @ApiParam — URL path parameters

```typescript
// For routes like /users/:id
@ApiParam({
  name: 'id',
  description: 'Unique identifier of the user',
  type: Number,
  example: 1,
})

// For routes like /users/:slug
@ApiParam({
  name: 'slug',
  description: 'URL-friendly identifier',
  type: String,
  example: 'john-doe',
})
```

### @ApiQuery — Query string parameters

```typescript
// Required query param
@ApiQuery({
  name: 'status',
  description: 'Filter by status',
  enum: OrderStatus,
  required: true,
})

// Optional query param with default
@ApiQuery({
  name: 'page',
  description: 'Page number',
  type: Number,
  required: false,
  example: 1,
})

// Optional search param
@ApiQuery({
  name: 'search',
  description: 'Search term for filtering results',
  type: String,
  required: false,
})
```

### @ApiResponse — What comes back?

```typescript
// Success with type
@ApiResponse({
  status: 200,
  description: 'User retrieved successfully',
  type: UserResponseDto,
})

// Success for creation
@ApiResponse({
  status: 201,
  description: 'User created successfully',
  type: UserResponseDto,
})

// Success with no content
@ApiResponse({
  status: 204,
  description: 'User deleted successfully',
})

// Error responses
@ApiResponse({ status: 400, description: 'Validation error — invalid input data' })
@ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid token' })
@ApiResponse({ status: 403, description: 'Forbidden — insufficient permissions' })
@ApiResponse({ status: 404, description: 'Not found — resource does not exist' })
@ApiResponse({ status: 409, description: 'Conflict — resource already exists' })
@ApiResponse({ status: 429, description: 'Too many requests — rate limit exceeded' })
```

## DTO-Level Decorators

### @ApiProperty — Required properties

```typescript
@ApiProperty({
  description: 'What this property is',
  example: 'realistic value',
})
```

### @ApiPropertyOptional — Optional properties

```typescript
@ApiPropertyOptional({
  description: 'What this property is',
  example: 'realistic value',
})
```

## Decorator Placement Order

Decorators should be placed in this order on endpoints:

```typescript
@ApiOperation(...)        // 1st — What does it do?
@ApiBearerAuth()          // 2nd — Auth required? (if applicable)
@ApiBody(...)             // 3rd — Request body (if applicable)
@ApiParam(...)            // 4th — URL params (if applicable)
@ApiQuery(...)            // 5th — Query params (if applicable)
@ApiResponse(...)         // 6th — Success response
@ApiResponse(...)         // 7th — Error responses
@UseGuards(...)           // 8th — Guards (existing)
@Post/Get/Put/Delete(...) // 9th — HTTP method (existing)
```

On DTOs, place @ApiProperty BEFORE class-validator decorators:

```typescript
@ApiProperty({...})       // 1st — Swagger
@IsString()               // 2nd — Validation
@MinLength(2)             // 3rd — Constraints
name: string;
```
