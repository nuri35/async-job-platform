import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  Res,
  Req,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiParam,
  ApiBearerAuth,
  ApiHeader,
} from '@nestjs/swagger';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import type { JwtPayload } from '@app/common';

import { AuthService } from '../services';
import {
  RegisterDto,
  LoginDto,
  RefreshTokenDto,
  TokensResponseDto,
  SessionDto,
  VerifyEmailDto,
  ResendVerificationDto,
} from '../dto';
import { JwtAuthGuard, RegisterRateLimitGuard } from '../guards';
import { Public, CurrentUser } from '../decorators';
import { CsrfForAuthGuard } from '../../../common/guards';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Public()
  @UseGuards(RegisterRateLimitGuard)
  @Post('register')
  @ApiOperation({
    summary: 'Register a new user',
    description: 'Creates a new user account with email and password.',
  })
  @ApiBody({ type: RegisterDto })
  @ApiResponse({
    status: 201,
    description: 'Account created successfully.',
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error — invalid input data',
  })
  @ApiResponse({
    status: 429,
    description: 'Too many registration attempts from this IP',
  })
  async register(@Body() dto: RegisterDto) {
    await this.authService.register(dto);

    // Always return the same response to prevent email enumeration
    return {
      message:
        'If your email is not already registered, your account has been created.',
    };
  }

  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify email address',
    description: 'Verifies user email using the token sent via email.',
  })
  @ApiBody({ type: VerifyEmailDto })
  @ApiResponse({ status: 200, description: 'Email verification processed.' })
  @ApiResponse({ status: 400, description: 'Invalid or expired token.' })
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    await this.authService.verifyEmail(dto.token);
    return { message: 'Email verification processed.' };
  }

  @Public()
  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Resend verification email',
    description:
      'Resends the verification email. Returns generic response regardless of outcome.',
  })
  @ApiBody({ type: ResendVerificationDto })
  @ApiResponse({
    status: 200,
    description:
      'If the email exists and is unverified, a new verification email has been sent.',
  })
  async resendVerification(@Body() dto: ResendVerificationDto) {
    await this.authService.resendVerificationEmail(dto.email);
    return {
      message:
        'If the email exists and is unverified, a new verification email has been sent.',
    };
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Login with email and password',
    description:
      'Authenticates user with email and password. Returns JWT access token in body and sets refresh token as HttpOnly cookie.',
  })
  @ApiBody({ type: LoginDto })
  @ApiResponse({
    status: 200,
    description: 'Login successful',
    type: TokensResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error — invalid email or password format',
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @ApiResponse({
    status: 403,
    description: 'Account disabled',
  })
  @ApiResponse({
    status: 429,
    description: 'Too many requests — rate limit exceeded',
  })
  async login(
    @Body() dto: LoginDto,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const ipAddress =
      req.ip || req.headers['x-forwarded-for']?.toString() || null;
    const userAgent = req.headers['user-agent'] || null;

    const result = await this.authService.login(dto, ipAddress, userAgent);

    // Set refresh token as HttpOnly cookie
    const isProduction = this.configService.get('NODE_ENV') === 'production';
    res.setCookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      path: '/auth/refresh',
      maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
    });

    // Return access token in response body
    return {
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
      tokenType: result.tokenType,
    };
  }

  @Public()
  @UseGuards(CsrfForAuthGuard)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiHeader({ name: 'x-csrf-token', required: true })
  @ApiOperation({
    summary: 'Refresh access token',
    description:
      'Exchanges a refresh token for a new access token. Refresh token can be sent via HttpOnly cookie or request body.',
  })
  @ApiBody({ type: RefreshTokenDto })
  @ApiResponse({
    status: 200,
    description: 'Token refreshed successfully',
    type: TokensResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Refresh token is required' })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
  @ApiResponse({ status: 403, description: 'CSRF token missing or invalid' })
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    // Get refresh token from cookie or body
    const refreshToken = req.cookies?.['refreshToken'] || dto.refreshToken;
    if (!refreshToken) {
      throw new BadRequestException('Refresh token is required');
    }

    // Get current JTI from access token if present (for blacklisting)
    let currentJti: string | null = null;
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const token = authHeader.substring(7);
        const payload = JSON.parse(
          Buffer.from(token.split('.')[1], 'base64').toString(),
        ) as { jti?: string };
        currentJti = payload.jti || null;
      } catch {
        // Ignore parsing errors
      }
    }

    const result = await this.authService.refresh(refreshToken, currentJti);

    // Set new refresh token as HttpOnly cookie
    const isProduction = this.configService.get('NODE_ENV') === 'production';
    res.setCookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      path: '/auth/refresh',
      maxAge: 7 * 24 * 60 * 60,
    });

    return {
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
      tokenType: result.tokenType,
    };
  }

  @UseGuards(JwtAuthGuard, CsrfForAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiHeader({ name: 'x-csrf-token', required: true })
  @ApiOperation({
    summary: 'Logout current session',
    description:
      'Invalidates the current session and clears the refresh token cookie.',
  })
  @ApiResponse({ status: 204, description: 'Logged out successfully' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — missing or invalid token',
  })
  async logout(
    @CurrentUser() user: JwtPayload,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    await this.authService.logout(user.sub, user.jti);

    // Clear refresh token cookie
    res.clearCookie('refreshToken', { path: '/auth/refresh' });
  }

  @UseGuards(JwtAuthGuard, CsrfForAuthGuard)
  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiHeader({ name: 'x-csrf-token', required: true })
  @ApiOperation({
    summary: 'Logout from all devices',
    description:
      'Invalidates all active sessions for the current user and clears the refresh token cookie.',
  })
  @ApiResponse({ status: 204, description: 'Logged out from all devices' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — missing or invalid token',
  })
  async logoutAll(
    @CurrentUser('sub') userId: string,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    await this.authService.logoutAll(userId);

    // Clear refresh token cookie
    res.clearCookie('refreshToken', { path: '/auth/refresh' });
  }

  @UseGuards(JwtAuthGuard)
  @Get('sessions')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get all active sessions',
    description:
      'Returns a list of all active sessions for the current user. Current session is marked.',
  })
  @ApiResponse({
    status: 200,
    description: 'Active sessions retrieved',
    type: [SessionDto],
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — missing or invalid token',
  })
  async getSessions(@CurrentUser() user: JwtPayload): Promise<SessionDto[]> {
    return this.authService.getSessions(user.sub, user.jti);
  }

  @UseGuards(JwtAuthGuard, CsrfForAuthGuard)
  @Delete('sessions/:sessionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiHeader({ name: 'x-csrf-token', required: true })
  @ApiOperation({
    summary: 'Revoke a specific session',
    description:
      'Terminates a specific session by its ID. Cannot revoke the current active session.',
  })
  @ApiParam({
    name: 'sessionId',
    description: 'Session identifier to revoke',
    type: String,
  })
  @ApiResponse({ status: 204, description: 'Session revoked' })
  @ApiResponse({ status: 400, description: 'Cannot revoke current session' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — missing or invalid token',
  })
  @ApiResponse({ status: 404, description: 'Session not found' })
  async revokeSession(
    @CurrentUser() user: JwtPayload,
    @Param('sessionId') sessionId: string,
  ) {
    await this.authService.revokeSession(user.sub, sessionId, user.jti);
  }

  // CSRF Token endpoint (Double Submit Cookie Pattern)
  @Public()
  @Get('csrf-token')
  @ApiOperation({
    summary: 'Get CSRF token',
    description:
      'Generates a CSRF token using Double Submit Cookie pattern. Token is set as a signed HttpOnly cookie and also returned in the response body.',
  })
  @ApiResponse({ status: 200, description: 'CSRF token returned' })
  getCsrfToken(@Res({ passthrough: true }) res: FastifyReply) {
    // Generate random token
    const token = randomBytes(32).toString('hex');

    // Set as signed cookie
    const isProduction = this.configService.get('NODE_ENV') === 'production';
    res.setCookie('csrf-token', token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      signed: true,
      path: '/',
      maxAge: 24 * 60 * 60, // 24 hours
    });

    // Return same token in response (client will send in x-csrf-token header)
    return { csrfToken: token };
  }

  // Me endpoint - get current user info
  @UseGuards(JwtAuthGuard)
  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get current user info',
    description:
      'Returns the ID, email, and role of the currently authenticated user.',
  })
  @ApiResponse({ status: 200, description: 'Current user info' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — missing or invalid token',
  })
  getMe(@CurrentUser() user: JwtPayload) {
    return {
      id: user.sub,
      email: user.email,
      role: user.role,
    };
  }
}
