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

  @Get('summary')
  @ApiOperation({ summary: '[Admin] Get risk monitoring summary' })
  @ApiResponse({
    status: 200,
    description: 'Risk summary with counts by level',
    schema: {
      example: {
        totalActiveIps: 5,
        highRiskCount: 1,
        mediumRiskCount: 2,
        lowRiskCount: 2,
      },
    },
  })
  async getSummary() {
    return this.riskMonitorService.getSummary();
  }

  @Get('active-risks')
  @ApiOperation({ summary: '[Admin] Get all active risk IPs with details' })
  @ApiResponse({
    status: 200,
    description: 'List of active risks sorted by score (highest first)',
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
  async getActiveRisks() {
    return this.riskMonitorService.getAllActiveRisks();
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
    schema: {
      example: {
        ip: '192.168.1.100',
        score: 40,
        level: 'MEDIUM',
        attackType: 'BRUTE_FORCE',
        breakdown: {
          failedCount: 8,
          failedScore: 40,
          targetCount: 1,
          targetScore: 0,
        },
        targets: ['victim@test.com'],
        previousLevel: null,
        levelChanged: false,
      },
    },
  })
  async getRiskByIp(@Query('ip') ip: string) {
    return this.riskMonitorService.getRiskByIp(ip);
  }
}
