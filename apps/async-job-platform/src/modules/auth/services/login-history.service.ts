import { Injectable } from '@nestjs/common';
import { LoginHistory, LoginStatus, LoginFailureReason } from '@app/common';
import { ILoginHistoryRepository, LoginHistoryStats } from '../repositories';
import { LoginStatsService, DetailedLoginStats } from './login-stats.service';

export interface RecordLoginParams {
  userId: string | null;
  email: string | null;
  status: LoginStatus;
  failureReason?: LoginFailureReason;
  sessionJti?: string;
  deviceInfo: {
    ipAddress: string | null;
    userAgent: string | null;
    deviceFingerprint: string | null;
    deviceName: string | null;
  };
  geoInfo?: {
    countryCode: string | null;
    city: string | null;
  };
}

export interface UserLoginHistoryResponse {
  history: LoginHistory[];
  total: number;
  stats: LoginHistoryStats;
  lastSuccessfulLogin: LoginHistory | null;
}

@Injectable()
export class LoginHistoryService {
  constructor(
    private readonly loginHistoryRepository: ILoginHistoryRepository,
    private readonly loginStatsService: LoginStatsService,
  ) {}

  /**
   * Record a login attempt (both PostgreSQL and Redis)
   */
  async recordLogin(params: RecordLoginParams): Promise<LoginHistory> {
    const now = new Date();

    // 1. Save to PostgreSQL (persistent)
    const loginHistory = this.loginHistoryRepository.create({
      userId: params.userId,
      email: params.email,
      status: params.status,
      failureReason: params.failureReason || null,
      sessionJti: params.sessionJti || null,
      loggedAt: now,
      ipAddress: params.deviceInfo.ipAddress,
      userAgent: params.deviceInfo.userAgent,
      deviceFingerprint: params.deviceInfo.deviceFingerprint,
      deviceName: params.deviceInfo.deviceName,
      countryCode: params.geoInfo?.countryCode || null,
      city: params.geoInfo?.city || null,
    });

    const saved = await this.loginHistoryRepository.save(loginHistory);

    // 2. Record to Redis (real-time stats)
    await this.loginStatsService.recordLogin(params.status, params.userId, {
      email: params.email || undefined,
      ipAddress: params.deviceInfo.ipAddress || undefined,
    });

    return saved;
  }

  /**
   * Get user's login history with stats
   */
  async getUserLoginHistory(
    userId: string,
    limit = 20,
    offset = 0,
  ): Promise<UserLoginHistoryResponse> {
    const [history, total, stats, lastSuccessfulLogin] = await Promise.all([
      this.loginHistoryRepository.findByUserId(userId, limit, offset),
      this.loginHistoryRepository.countByUserId(userId),
      this.loginHistoryRepository.getStatsByUserId(userId),
      this.loginHistoryRepository.findLastSuccessfulLogin(userId),
    ]);

    return {
      history,
      total,
      stats,
      lastSuccessfulLogin,
    };
  }

  /**
   * Get real-time login statistics from Redis
   */
  async getRealtimeStats(): Promise<DetailedLoginStats> {
    return this.loginStatsService.getDetailedStats();
  }

  /**
   * Get login statistics for a date range from PostgreSQL
   */
  async getStatsForDateRange(
    startDate: Date,
    endDate: Date,
  ): Promise<LoginHistoryStats> {
    return this.loginHistoryRepository.getStatsByDateRange(startDate, endDate);
  }

  /**
   * Get failed login attempts from a specific IP
   */
  async getFailedLoginsByIp(
    ipAddress: string,
    since: Date,
  ): Promise<LoginHistory[]> {
    return this.loginHistoryRepository.findFailedLoginsByIp(ipAddress, since);
  }

  /**
   * Check for suspicious activity (multiple failed logins from same IP)
   */
  async checkSuspiciousActivity(
    ipAddress: string,
    thresholdMinutes = 30,
    maxFailedAttempts = 10,
  ): Promise<{ suspicious: boolean; failedCount: number }> {
    const since = new Date(Date.now() - thresholdMinutes * 60 * 1000);
    const failedLogins = await this.getFailedLoginsByIp(ipAddress, since);

    return {
      suspicious: failedLogins.length >= maxFailedAttempts,
      failedCount: failedLogins.length,
    };
  }

  /**
   * Cleanup old login history records
   */
  async cleanupOldRecords(retentionDays = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    return this.loginHistoryRepository.deleteOlderThan(cutoffDate);
  }

  /**
   * Get hourly stats trend for dashboard
   */
  async getHourlyTrend(hours = 24) {
    return this.loginStatsService.getStatsForLastHours(hours);
  }

  /**
   * Get daily stats trend for dashboard
   */
  async getDailyTrend(days = 7) {
    return this.loginStatsService.getStatsForLastDays(days);
  }
}
