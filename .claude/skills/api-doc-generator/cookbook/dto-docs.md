# Purpose

Document NestJS DTOs (Data Transfer Objects) with Swagger property decorators.

## Variables

REQUIRED_DECORATOR: ApiProperty
OPTIONAL_DECORATOR: ApiPropertyOptional

## Instructions

### Step 1: Identify DTO Files

- Look for files matching `*.dto.ts` pattern in the target module directory.
- Common locations: `src/<module>/dto/`, `src/<module>/dtos/`, or directly in `src/<module>/`.
- Also check for response DTOs that may be in a separate `responses/` folder.

### Step 2: Analyze Each Property

For each property in the DTO, determine:

- **Is it required or optional?** → Check for `?` or `@IsOptional()`
- **What type is it?** → string, number, boolean, enum, nested object, array
- **Does it have validation decorators?** → Read `class-validator` decorators for constraints
- **What's a realistic example value?** → Generate based on property name and type

### Step 3: Add Property Decorators

**For required properties → @ApiProperty:**

```typescript
@ApiProperty({
  description: 'Clear description of what this property is',
  example: 'realistic-example-value',
})
```

**For optional properties → @ApiPropertyOptional:**

```typescript
@ApiPropertyOptional({
  description: 'Clear description',
  example: 'realistic-example-value',
})
```

### Step 4: Handle Special Types

**Enums:**
```typescript
@ApiProperty({
  description: 'User role',
  enum: UserRole,
  enumName: 'UserRole',
  example: UserRole.USER,
})
role: UserRole;
```

**Arrays:**
```typescript
@ApiProperty({
  description: 'List of tag names',
  type: [String],
  example: ['nestjs', 'typescript'],
})
tags: string[];
```

**Nested Objects:**
```typescript
@ApiProperty({
  description: 'User address information',
  type: () => AddressDto,
})
address: AddressDto;
```

**Arrays of Nested Objects:**
```typescript
@ApiProperty({
  description: 'List of order items',
  type: () => [OrderItemDto],
})
items: OrderItemDto[];
```

**Dates:**
```typescript
@ApiProperty({
  description: 'Account creation date',
  type: String,
  format: 'date-time',
  example: '2025-01-15T10:30:00Z',
})
createdAt: Date;
```

**Numbers with constraints:**
```typescript
@ApiProperty({
  description: 'Page number for pagination',
  minimum: 1,
  default: 1,
  example: 1,
})
@IsInt()
@Min(1)
page: number;
```

### Step 5: Read Validation Decorators for Hints

Map class-validator decorators to ApiProperty fields:

| class-validator | ApiProperty field |
|----------------|-------------------|
| @MinLength(n)  | minLength: n |
| @MaxLength(n)  | maxLength: n |
| @Min(n)        | minimum: n |
| @Max(n)        | maximum: n |
| @IsEmail()     | format: 'email', example: 'user@example.com' |
| @IsUrl()       | format: 'uri', example: 'https://example.com' |
| @IsUUID()      | format: 'uuid', example: '550e8400-e29b-41d4-a716-446655440000' |
| @IsDateString()| format: 'date-time' |
| @IsEnum(X)     | enum: X, enumName: 'X' |
| @IsArray()     | isArray: true |
| @IsInt()       | type: 'integer' |

### Import Rules

Add this import if missing:

```typescript
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
```

Only import `ApiPropertyOptional` if the DTO has optional properties.

## Example Transformation

### Before

```typescript
import { IsString, IsEmail, IsOptional, MinLength, IsEnum } from 'class-validator';

export class CreateUserDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsEnum(UserRole)
  role: UserRole;
}
```

### After

```typescript
import { IsString, IsEmail, IsOptional, MinLength, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({
    description: 'Full name of the user',
    example: 'John Doe',
    minLength: 2,
  })
  @IsString()
  @MinLength(2)
  name: string;

  @ApiProperty({
    description: 'Email address of the user',
    format: 'email',
    example: 'john.doe@example.com',
  })
  @IsEmail()
  email: string;

  @ApiProperty({
    description: 'Account password',
    example: 'SecureP@ss123',
    minLength: 8,
  })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiPropertyOptional({
    description: 'Phone number with country code',
    example: '+905551234567',
  })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({
    description: 'Role assigned to the user',
    enum: UserRole,
    enumName: 'UserRole',
    example: UserRole.USER,
  })
  @IsEnum(UserRole)
  role: UserRole;
}
```
