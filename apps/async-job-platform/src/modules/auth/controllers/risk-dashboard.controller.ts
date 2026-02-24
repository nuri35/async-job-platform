import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import type { Role } from '@app/common';
import { RiskMonitorService } from '../services';
import { JwtAuthGuard, RolesGuard } from '../guards';
import { Roles } from '../decorators';

@ApiTags('Risk Dashboard')
@Controller('risk-dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin' as Role)
@ApiBearerAuth()
export class RiskDashboardController {
  constructor(private readonly riskMonitorService: RiskMonitorService) {}

  // ============ SUMMARY ============

  @Get('summary')
  @ApiOperation({
    summary: '[Admin] Get comprehensive risk monitoring summary',
  })
  @ApiResponse({
    status: 200,
    description:
      'Risk summary with counts by level for IP, Fingerprint, and Email',
    schema: {
      example: {
        ip: {
          total: 5,
          high: 1,
          medium: 2,
          low: 2,
        },
        fingerprint: {
          total: 3,
          high: 1,
          medium: 1,
          low: 1,
        },
        email: {
          total: 2,
          high: 0,
          medium: 1,
          low: 1,
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — missing or invalid token',
  })
  @ApiResponse({ status: 403, description: 'Forbidden — admin role required' })
  async getSummary() {
    return this.riskMonitorService.getSummary();
  }

  // ============ IP ENDPOINTS ============

  @Get('ips')
  @ApiOperation({ summary: '[Admin] Get all active IP risks with details' })
  @ApiResponse({
    status: 200,
    description: 'List of active IP risks sorted by score (highest first)',
    schema: {
      example: [
        {
          ip: '192.168.1.100',
          score: 65,
          level: 'HIGH',
          attackType: 'CREDENTIAL_STUFFING',
          breakdown: {
            failedCount: 8,
            failedScore: 40,
            targetCount: 3,
            targetScore: 30,
          },
          targets: ['user1@test.com', 'user2@test.com', 'user3@test.com'],
          previousLevel: 'MEDIUM',
          levelChanged: true,
        },
      ],
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — missing or invalid token',
  })
  @ApiResponse({ status: 403, description: 'Forbidden — admin role required' })
  async getActiveIpRisks() {
    return this.riskMonitorService.getAllActiveIpRisks();
  }

  @Get('ip')
  @ApiOperation({ summary: '[Admin] Get risk details for specific IP' })
  @ApiQuery({
    name: 'ip',
    required: true,
    type: String,
    example: '192.168.1.1',
  })
  @ApiResponse({
    status: 200,
    description: 'Risk details for the specified IP',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — missing or invalid token',
  })
  @ApiResponse({ status: 403, description: 'Forbidden — admin role required' })
  async getRiskByIp(@Query('ip') ip: string) {
    return this.riskMonitorService.getRiskByIp(ip);
  }

  // ============ FINGERPRINT ENDPOINTS ============

  @Get('fingerprints')
  @ApiOperation({
    summary:
      '[Admin] Get all active fingerprint risks (VPN rotation detection)',
  })
  @ApiResponse({
    status: 200,
    description:
      'List of active fingerprint risks sorted by score (highest first)',
    schema: {
      example: [
        {
          fingerprint: 'fp_abc123xyz',
          score: 55,
          level: 'HIGH',
          attackType: 'VPN_ROTATION',
          breakdown: {
            failedCount: 5,
            failedScore: 25,
            ipCount: 4,
            ipRotationScore: 60,
            targetCount: 1,
            targetScore: 0,
          },
          ips: ['1.1.1.1', '2.2.2.2', '3.3.3.3', '4.4.4.4'],
          targets: ['admin@test.com'],
          previousLevel: null,
          levelChanged: false,
        },
      ],
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — missing or invalid token',
  })
  @ApiResponse({ status: 403, description: 'Forbidden — admin role required' })
  async getActiveFingerprintRisks() {
    return this.riskMonitorService.getAllActiveFingerprintRisks();
  }

  @Get('fingerprint')
  @ApiOperation({
    summary: '[Admin] Get risk details for specific fingerprint',
  })
  @ApiQuery({
    name: 'fp',
    required: true,
    type: String,
    example: 'fp_abc123xyz',
    description: 'Device fingerprint',
  })
  @ApiResponse({
    status: 200,
    description: 'Risk details for the specified fingerprint',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — missing or invalid token',
  })
  @ApiResponse({ status: 403, description: 'Forbidden — admin role required' })
  async getRiskByFingerprint(@Query('fp') fingerprint: string) {
    return this.riskMonitorService.getRiskByFingerprint(fingerprint);
  }

  // ============ EMAIL ENDPOINTS (Accounts Under Attack) ============

  @Get('emails')
  @ApiOperation({
    summary: '[Admin] Get all emails under attack (victim protection)',
  })
  @ApiResponse({
    status: 200,
    description: 'List of emails under attack sorted by score (highest first)',
    schema: {
      example: [
        {
          email: 'ceo@company.com',
          score: 65,
          level: 'HIGH',
          attackType: 'BOTNET',
          breakdown: {
            failedCount: 10,
            failedScore: 30,
            attackerIpCount: 5,
            attackerIpScore: 40,
            attackerFpCount: 4,
            attackerFpScore: 45,
          },
          attackerIps: ['1.1.1.1', '2.2.2.2', '3.3.3.3', '4.4.4.4', '5.5.5.5'],
          attackerFingerprints: ['fp1', 'fp2', 'fp3', 'fp4'],
          previousLevel: 'MEDIUM',
          levelChanged: true,
        },
      ],
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — missing or invalid token',
  })
  @ApiResponse({ status: 403, description: 'Forbidden — admin role required' })
  async getActiveEmailRisks() {
    return this.riskMonitorService.getAllActiveEmailRisks();
  }

  @Get('email')
  @ApiOperation({ summary: '[Admin] Get risk details for specific email' })
  @ApiQuery({
    name: 'email',
    required: true,
    type: String,
    example: 'user@company.com',
    description: 'Email address under attack',
  })
  @ApiResponse({
    status: 200,
    description: 'Risk details for the specified email',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — missing or invalid token',
  })
  @ApiResponse({ status: 403, description: 'Forbidden — admin role required' })
  async getRiskByEmail(@Query('email') email: string) {
    return this.riskMonitorService.getRiskByEmail(email);
  }

  // ============ LEGACY ENDPOINT (Backward Compatibility) ============

  /**
   * @deprecated Use /ips instead
   */
  @Get('active-risks')
  @ApiOperation({
    summary: '[Deprecated] Use /ips instead',
    deprecated: true,
  })
  async getActiveRisks() {
    return this.riskMonitorService.getAllActiveIpRisks();
  }
}
