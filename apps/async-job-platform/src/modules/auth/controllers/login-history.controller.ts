import {
  Controller,
  Get,
  Query,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import type { JwtPayload, Role } from '@app/common';
import { LoginHistoryService } from '../services';
import { JwtAuthGuard, RolesGuard } from '../guards';
import { CurrentUser, Roles } from '../decorators';

@ApiTags('Login History')
@Controller('login-history')
export class LoginHistoryController {
  constructor(private readonly loginHistoryService: LoginHistoryService) {}

  // ==================== USER ENDPOINTS ====================

  @UseGuards(JwtAuthGuard)
  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get my login history' })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiQuery({ name: 'offset', required: false, type: Number, example: 0 })
  @ApiResponse({ status: 200, description: 'Login history retrieved' })
  async getMyLoginHistory(
    @CurrentUser() user: JwtPayload,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ) {
    return this.loginHistoryService.getUserLoginHistory(
      user.sub,
      limit,
      offset,
    );
  }

  // ==================== ADMIN DASHBOARD ENDPOINTS ====================

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin' as Role)
  @Get('dashboard/realtime')
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Get real-time login statistics' })
  @ApiResponse({
    status: 200,
    description: 'Real-time stats (last 5min, 1hr, today)',
  })
  async getRealtimeStats() {
    return this.loginHistoryService.getRealtimeStats();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin' as Role)
  @Get('dashboard/hourly-trend')
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Get hourly login trend' })
  @ApiQuery({ name: 'hours', required: false, type: Number, example: 24 })
  @ApiResponse({ status: 200, description: 'Hourly trend data' })
  async getHourlyTrend(
    @Query('hours', new DefaultValuePipe(24), ParseIntPipe) hours: number,
  ) {
    const trend = await this.loginHistoryService.getHourlyTrend(hours);
    return {
      hours,
      data: trend.map((stat, index) => ({
        hoursAgo: index,
        ...stat,
      })),
    };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin' as Role)
  @Get('dashboard/daily-trend')
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Get daily login trend' })
  @ApiQuery({ name: 'days', required: false, type: Number, example: 7 })
  @ApiResponse({ status: 200, description: 'Daily trend data' })
  async getDailyTrend(
    @Query('days', new DefaultValuePipe(7), ParseIntPipe) days: number,
  ) {
    const trend = await this.loginHistoryService.getDailyTrend(days);
    return {
      days,
      data: trend.map((stat, index) => ({
        daysAgo: index,
        ...stat,
      })),
    };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin' as Role)
  @Get('dashboard/suspicious')
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Check suspicious activity from IP' })
  @ApiQuery({ name: 'ip', required: true, type: String })
  @ApiQuery({ name: 'minutes', required: false, type: Number, example: 30 })
  @ApiResponse({ status: 200, description: 'Suspicious activity check result' })
  async checkSuspiciousActivity(
    @Query('ip') ipAddress: string,
    @Query('minutes', new DefaultValuePipe(30), ParseIntPipe) minutes: number,
  ) {
    return this.loginHistoryService.checkSuspiciousActivity(ipAddress, minutes);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin' as Role)
  @Get('dashboard/failed-by-ip')
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Get failed logins from specific IP' })
  @ApiQuery({ name: 'ip', required: true, type: String })
  @ApiQuery({ name: 'hours', required: false, type: Number, example: 24 })
  @ApiResponse({ status: 200, description: 'Failed login attempts from IP' })
  async getFailedLoginsByIp(
    @Query('ip') ipAddress: string,
    @Query('hours', new DefaultValuePipe(24), ParseIntPipe) hours: number,
  ) {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    const logins = await this.loginHistoryService.getFailedLoginsByIp(
      ipAddress,
      since,
    );
    return {
      ipAddress,
      since: since.toISOString(),
      count: logins.length,
      logins,
    };
  }
}
