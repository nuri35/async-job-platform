import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RiskTrackingService } from './risk-tracking.service';
import {
  RiskScoringService,
  RiskScoreResult,
  RiskLevel,
} from './risk-scoring.service';

export interface RiskAlertPayload {
  ip: string;
  oldLevel: RiskLevel | null;
  newLevel: RiskLevel;
  score: number;
  attackType: string;
  targets: string[];
  failedCount: number;
  targetCount: number;
  timestamp: Date;
}

@Injectable()
export class RiskMonitorService {
  private readonly logger = new Logger(RiskMonitorService.name);
  private isRunning = false;

  constructor(
    private readonly riskTrackingService: RiskTrackingService,
    private readonly riskScoringService: RiskScoringService,
  ) {}

  /**
   * Her 30 saniyede çalışan CronJob
   * Best Practice: Concurrent execution önleme
   */
  @Cron(CronExpression.EVERY_30_SECONDS)
  async handleCron(): Promise<void> {
    // Concurrent çalışmayı önle
    if (this.isRunning) {
      this.logger.debug('Previous job still running, skipping...');
      return;
    }

    this.isRunning = true;

    try {
      await this.monitorRisks();
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Risk monitoring logic
   */
  private async monitorRisks(): Promise<void> {
    const activeIps = await this.riskTrackingService.getActiveIps();

    if (activeIps.length === 0) {
      return;
    }

    this.logger.debug(`Monitoring ${activeIps.length} active IPs`);

    // Paralel işleme (Promise.allSettled ile hata toleransı)
    const results = await Promise.allSettled(
      activeIps.map((ip) => this.processIp(ip)),
    );

    // Hataları logla
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        this.logger.error(
          `Failed to process IP ${activeIps[index]}`,
          result.reason,
        );
      }
    });

    // Temizlik
    await this.riskTrackingService.cleanupOldAttempts();
  }

  /**
   * Tek IP işle
   */
  private async processIp(ip: string): Promise<void> {
    const result = await this.riskScoringService.calculateRiskScore(ip);

    // Aktivite bitti
    if (result.breakdown.failedCount === 0) {
      await this.riskTrackingService.removeFromActive(ip);
      return;
    }

    // Level değişikliği kontrol
    await this.checkLevelChange(result);
  }

  /**
   * Level değişikliği kontrol ve alert
   */
  private async checkLevelChange(result: RiskScoreResult): Promise<void> {
    const { ip, level, previousLevel } = result;

    // İlk kez görülen ve LOW değil
    const isNewThreat = previousLevel === null && level !== RiskLevel.LOW;

    // Level yükseldi
    const isEscalation =
      result.levelChanged &&
      this.riskScoringService.isLevelEscalated(previousLevel, level);

    if (isNewThreat || isEscalation) {
      await this.sendAlert(result);
    }

    // Level değiştiyse kaydet
    if (result.levelChanged || isNewThreat) {
      await this.riskTrackingService.setRiskLevel(ip, level);
    }
  }

  /**
   * Alert gönder (şimdilik log, sonra email queue)
   */
  private async sendAlert(result: RiskScoreResult): Promise<void> {
    const alert: RiskAlertPayload = {
      ip: result.ip,
      oldLevel: result.previousLevel,
      newLevel: result.level,
      score: result.score,
      attackType: result.attackType,
      targets: result.targets,
      failedCount: result.breakdown.failedCount,
      targetCount: result.breakdown.targetCount,
      timestamp: new Date(),
    };

    // Log alert
    this.logger.warn(
      `🚨 RISK ALERT | IP: ${alert.ip} | ` +
        `${alert.oldLevel || 'NEW'} → ${alert.newLevel} | ` +
        `Score: ${alert.score} | Type: ${alert.attackType} | ` +
        `Targets: ${alert.targets.join(', ')}`,
    );

    // TODO: Email queue entegrasyonu
    // await this.emailQueue.add('risk-alert', alert);
    await Promise.resolve(); // Placeholder for future async email queue
  }

  // ============ PUBLIC API (Dashboard için) ============

  /**
   * Tüm aktif riskleri getir
   */
  async getAllActiveRisks(): Promise<RiskScoreResult[]> {
    const activeIps = await this.riskTrackingService.getActiveIps();

    const results = await Promise.all(
      activeIps.map((ip) => this.riskScoringService.calculateRiskScore(ip)),
    );

    return results
      .filter((r) => r.breakdown.failedCount > 0)
      .sort((a, b) => b.score - a.score);
  }

  /**
   * Belirli IP için risk bilgisi
   */
  async getRiskByIp(ip: string): Promise<RiskScoreResult> {
    return this.riskScoringService.calculateRiskScore(ip);
  }

  /**
   * Özet istatistikler
   */
  async getSummary(): Promise<{
    totalActiveIps: number;
    highRiskCount: number;
    mediumRiskCount: number;
    lowRiskCount: number;
  }> {
    const risks = await this.getAllActiveRisks();

    return {
      totalActiveIps: risks.length,
      highRiskCount: risks.filter((r) => r.level === RiskLevel.HIGH).length,
      mediumRiskCount: risks.filter((r) => r.level === RiskLevel.MEDIUM).length,
      lowRiskCount: risks.filter((r) => r.level === RiskLevel.LOW).length,
    };
  }
}
