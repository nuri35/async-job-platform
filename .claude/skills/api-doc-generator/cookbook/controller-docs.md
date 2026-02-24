# Purpose

Document NestJS controller endpoints with Swagger/OpenAPI decorators.

## Variables

DECORATOR_ORDER: ApiOperation, ApiBody, ApiParam, ApiQuery, ApiResponse
AUTH_DECORATOR: ApiBearerAuth
TAG_DECORATOR: ApiTags

## Instructions

### Step 1: Scan the Controller

- Run `tools/scan_endpoints.py` against the target controller file.
- This gives you structured data about every endpoint: method, path, parameters, guards, return types.
- Use this data to determine which decorators each endpoint needs.

### Step 2: Add Controller-Level Decorators

- Add `@ApiTags('module-name')` to the controller class (use kebab-case module name).
- If the controller uses any auth guard (`JwtAuthGuard`, `AuthGuard`, etc.), add `@ApiBearerAuth()` at class level.

### Step 3: Add Endpoint-Level Decorators

For EACH endpoint, add decorators in this order:

1. **@ApiOperation** — Always add.
   - `summary`: Short description (max 10 words)
   - `description`: Detailed explanation of what the endpoint does

2. **@ApiBody** — Only for POST, PUT, PATCH methods.
   - `type`: The DTO class used in @Body()

3. **@ApiParam** — Only if endpoint has URL parameters (`:id`, `:slug`, etc.).
   - `name`: Parameter name
   - `description`: What this parameter represents
   - `type`: String, Number, etc.

4. **@ApiQuery** — Only if endpoint uses @Query().
   - `name`: Query parameter name
   - `required`: true/false
   - `type`: Parameter type
   - `description`: What this query does

5. **@ApiResponse** — Always add. Multiple responses per endpoint.
   - Success response (200/201/204) with `type` pointing to response DTO
   - Error responses based on context (see rules below)

### Step 4: Add Return Types

- If the endpoint method doesn't have a return type annotation, add one.
- Use `Promise<ResponseDto>` format.

### Response Code Rules

| HTTP Method | Success Code | Description |
|-------------|-------------|-------------|
| GET         | 200         | Returns data successfully |
| POST        | 201         | Resource created successfully |
| PUT/PATCH   | 200         | Resource updated successfully |
| DELETE       | 204         | Resource deleted successfully |

### Error Response Rules

Add error responses based on the endpoint's context:

- **Has @Body()** → Add 400 (Validation error)
- **Has Auth Guard** → Add 401 (Unauthorized)
- **Has Role Guard** → Add 403 (Forbidden)
- **Has :id param** → Add 404 (Not found)
- **POST creating unique resource** → Add 409 (Conflict/Duplicate)
- **Always consider** → 500 (Internal server error) — only if INCLUDE_ERROR_RESPONSES is true

### Import Rules

Add these imports if missing:

```typescript
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,        // only if POST/PUT/PATCH exists
  ApiParam,       // only if :param exists
  ApiQuery,       // only if @Query() exists
  ApiBearerAuth,  // only if auth guard exists
} from '@nestjs/swagger';
```

## Example Transformation

### Before

```typescript
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  async getProfile(@Req() req) {
    return this.authService.getProfile(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('profile')
  async updateProfile(@Req() req, @Body() dto: UpdateProfileDto) {
    return this.authService.updateProfile(req.user.id, dto);
  }
}
```

### After

```typescript
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @ApiOperation({
    summary: 'User login',
    description: 'Authenticates user with email and password, returns JWT access and refresh tokens',
  })
  @ApiBody({ type: LoginDto })
  @ApiResponse({ status: 201, description: 'Login successful', type: LoginResponseDto })
  @ApiResponse({ status: 400, description: 'Validation error — invalid email or password format' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @Post('login')
  async login(@Body() dto: LoginDto): Promise<LoginResponseDto> {
    return this.authService.login(dto);
  }

  @ApiOperation({
    summary: 'Get current user profile',
    description: 'Returns the profile information of the authenticated user',
  })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Profile retrieved successfully', type: UserProfileDto })
  @ApiResponse({ status: 401, description: 'Unauthorized — invalid or expired token' })
  @UseGuards(JwtAuthGuard)
  @Get('profile')
  async getProfile(@Req() req): Promise<UserProfileDto> {
    return this.authService.getProfile(req.user.id);
  }

  @ApiOperation({
    summary: 'Update current user profile',
    description: 'Updates the profile information of the authenticated user',
  })
  @ApiBearerAuth()
  @ApiBody({ type: UpdateProfileDto })
  @ApiResponse({ status: 200, description: 'Profile updated successfully', type: UserProfileDto })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized — invalid or expired token' })
  @UseGuards(JwtAuthGuard)
  @Patch('profile')
  async updateProfile(@Req() req, @Body() dto: UpdateProfileDto): Promise<UserProfileDto> {
    return this.authService.updateProfile(req.user.id, dto);
  }
}
```
