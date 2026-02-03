import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RiskTrackingService } from './risk-tracking.service';
import {
  RiskScoringService,
  RiskScoreResult,
  FingerprintRiskResult,
  EmailRiskResult,
  RiskLevel,
} from './risk-scoring.service';

// ============ Alert Payloads ============

export interface IpRiskAlertPayload {
  type: 'IP';
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

export interface FingerprintRiskAlertPayload {
  type: 'FINGERPRINT';
  fingerprint: string;
  oldLevel: RiskLevel | null;
  newLevel: RiskLevel;
  score: number;
  attackType: string;
  ips: string[];
  targets: string[];
  failedCount: number;
  ipCount: number;
  timestamp: Date;
}

export interface EmailRiskAlertPayload {
  type: 'EMAIL';
  email: string;
  oldLevel: RiskLevel | null;
  newLevel: RiskLevel;
  score: number;
  attackType: string;
  attackerIps: string[];
  attackerFingerprints: string[];
  failedCount: number;
  timestamp: Date;
}

export type RiskAlertPayload =
  | IpRiskAlertPayload
  | FingerprintRiskAlertPayload
  | EmailRiskAlertPayload;

// ============ Summary Types ============

export interface RiskSummary {
  ip: {
    total: number;
    high: number;
    medium: number;
    low: number;
  };
  fingerprint: {
    total: number;
    high: number;
    medium: number;
    low: number;
  };
  email: {
    total: number;
    high: number;
    medium: number;
    low: number;
  };
}

@Injectable()
export class RiskMonitorService {
  private readonly logger = new Logger(RiskMonitorService.name);
  private isRunning = false;

  constructor(
    private readonly riskTrackingService: RiskTrackingService,
    private readonly riskScoringService: RiskScoringService,
  ) {}

  // ============ CRON JOB ============

  /**
   * CronJob running every 30 seconds
   * Best Practice: Prevent concurrent execution bunu dusunuruz calsıırken..
   */
  @Cron(CronExpression.EVERY_30_SECONDS)
  async handleCron(): Promise<void> {
    if (this.isRunning) {
      this.logger.debug('Previous job still running, skipping...');
      return;
    }

    this.isRunning = true;

    try {
      await this.monitorAllRisks();
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Main monitoring logic - monitors IPs, Fingerprints, and Emails
   */
  private async monitorAllRisks(): Promise<void> {
    // Fetch all active entities in parallel
    const [activeIps, activeFingerprints, activeEmails] = await Promise.all([
      this.riskTrackingService.getActiveIps(),
      this.riskTrackingService.getActiveFingerprints(),
      this.riskTrackingService.getActiveEmails(),
    ]);

    const hasActivity =
      activeIps.length > 0 ||
      activeFingerprints.length > 0 ||
      activeEmails.length > 0;

    if (!hasActivity) {
      return;
    }

    this.logger.debug(
      `Monitoring: ${activeIps.length} IPs, ${activeFingerprints.length} FPs, ${activeEmails.length} Emails`,
    );

    // Process all entities in parallel
    await Promise.all([
      this.processIps(activeIps),
      this.processFingerprints(activeFingerprints),
      this.processEmails(activeEmails),
    ]);

    // Cleanup old attempts
    await this.riskTrackingService.cleanupOldAttempts();
  }

  // ============ IP PROCESSING ============

  private async processIps(ips: string[]): Promise<void> {
    if (ips.length === 0) return;

    const results = await Promise.allSettled(
      ips.map((ip) => this.processIp(ip)),
    );

    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        this.logger.error(`Failed to process IP ${ips[index]}`, result.reason);
      }
    });
  }

  private async processIp(ip: string): Promise<void> {
    const result = await this.riskScoringService.calculateRiskScore(ip);

    // No activity - remove from active list
    if (result.breakdown.failedCount === 0) {
      await this.riskTrackingService.removeFromActive(ip);
      return;
    }

    await this.checkIpLevelChange(result);
  }

  private async checkIpLevelChange(result: RiskScoreResult): Promise<void> {
    const { ip, level, previousLevel } = result;

    const isNewThreat = previousLevel === null && level !== RiskLevel.LOW;
    const isEscalation =
      result.levelChanged &&
      this.riskScoringService.isLevelEscalated(previousLevel, level);

    if (isNewThreat || isEscalation) {
      this.sendIpAlert(result);
    }

    if (result.levelChanged || isNewThreat) {
      await this.riskTrackingService.setRiskLevel(ip, level);
    }
  }

  private sendIpAlert(result: RiskScoreResult): void {
    const alert: IpRiskAlertPayload = {
      type: 'IP',
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

    this.logger.warn(
      `🚨 IP ALERT | ${alert.ip} | ` +
        `${alert.oldLevel || 'NEW'} → ${alert.newLevel} | ` +
        `Score: ${alert.score} | Type: ${alert.attackType} | ` +
        `Targets: ${alert.targets.slice(0, 3).join(', ')}${alert.targets.length > 3 ? '...' : ''}`,
    );

    // TODO: Email queue integration
    // await this.emailQueue.add('ip-risk-alert', alert);
  }

  // ============ FINGERPRINT PROCESSING ============

  private async processFingerprints(fingerprints: string[]): Promise<void> {
    if (fingerprints.length === 0) return;

    const results = await Promise.allSettled(
      fingerprints.map((fp) => this.processFingerprint(fp)),
    );

    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        this.logger.error(
          `Failed to process Fingerprint ${fingerprints[index]}`,
          result.reason,
        );
      }
    });
  }

  private async processFingerprint(fingerprint: string): Promise<void> {
    const result =
      await this.riskScoringService.calculateFingerprintRiskScore(fingerprint);

    // No activity - remove from active list
    if (result.breakdown.failedCount === 0) {
      await this.riskTrackingService.removeFromActiveFingerprint(fingerprint);
      return;
    }

    await this.checkFingerprintLevelChange(result);
  }

  private async checkFingerprintLevelChange(
    result: FingerprintRiskResult,
  ): Promise<void> {
    const { fingerprint, level, previousLevel } = result;

    const isNewThreat = previousLevel === null && level !== RiskLevel.LOW;
    const isEscalation =
      result.levelChanged &&
      this.riskScoringService.isLevelEscalated(previousLevel, level);

    if (isNewThreat || isEscalation) {
      this.sendFingerprintAlert(result);
    }

    if (result.levelChanged || isNewThreat) {
      await this.riskTrackingService.setFingerprintRiskLevel(
        fingerprint,
        level,
      );
    }
  }

  private sendFingerprintAlert(result: FingerprintRiskResult) {
    const alert: FingerprintRiskAlertPayload = {
      type: 'FINGERPRINT',
      fingerprint: result.fingerprint,
      oldLevel: result.previousLevel,
      newLevel: result.level,
      score: result.score,
      attackType: result.attackType,
      ips: result.ips,
      targets: result.targets,
      failedCount: result.breakdown.failedCount,
      ipCount: result.breakdown.ipCount,
      timestamp: new Date(),
    };

    this.logger.warn(
      `🚨 FINGERPRINT ALERT | ${alert.fingerprint.substring(0, 16)}... | ` +
        `${alert.oldLevel || 'NEW'} → ${alert.newLevel} | ` +
        `Score: ${alert.score} | Type: ${alert.attackType} | ` +
        `IPs: ${alert.ipCount} | Targets: ${alert.targets.length}`,
    );

    // TODO: Email queue integration
    // await this.emailQueue.add('fingerprint-risk-alert', alert);
  }

  // ============ EMAIL PROCESSING (Victim Protection) ============

  private async processEmails(emails: string[]): Promise<void> {
    if (emails.length === 0) return;

    const results = await Promise.allSettled(
      emails.map((email) => this.processEmail(email)),
    );

    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        this.logger.error(
          `Failed to process Email ${emails[index]}`,
          result.reason,
        );
      }
    });
  }

  private async processEmail(email: string): Promise<void> {
    const result = await this.riskScoringService.calculateEmailRiskScore(email);

    // No activity - remove from active list
    if (result.breakdown.failedCount === 0) {
      await this.riskTrackingService.removeFromActiveEmail(email);
      return;
    }

    await this.checkEmailLevelChange(result);
  }

  private async checkEmailLevelChange(result: EmailRiskResult): Promise<void> {
    const { email, level, previousLevel } = result;

    const isNewThreat = previousLevel === null && level !== RiskLevel.LOW;
    const isEscalation =
      result.levelChanged &&
      this.riskScoringService.isLevelEscalated(previousLevel, level);

    if (isNewThreat || isEscalation) {
      this.sendEmailAlert(result);
    }

    if (result.levelChanged || isNewThreat) {
      await this.riskTrackingService.setEmailRiskLevel(email, level);
    }
  }

  private sendEmailAlert(result: EmailRiskResult) {
    const alert: EmailRiskAlertPayload = {
      type: 'EMAIL',
      email: result.email,
      oldLevel: result.previousLevel,
      newLevel: result.level,
      score: result.score,
      attackType: result.attackType,
      attackerIps: result.attackerIps,
      attackerFingerprints: result.attackerFingerprints,
      failedCount: result.breakdown.failedCount,
      timestamp: new Date(),
    };

    this.logger.warn(
      `🚨 EMAIL UNDER ATTACK | ${alert.email} | ` +
        `${alert.oldLevel || 'NEW'} → ${alert.newLevel} | ` +
        `Score: ${alert.score} | Type: ${alert.attackType} | ` +
        `Attackers: ${alert.attackerIps.length} IPs, ${alert.attackerFingerprints.length} FPs`,
    );

    // TODO: Notify user about attack on their account
    // await this.emailQueue.add('account-under-attack', alert);
  }

  // ============ PUBLIC API (Dashboard) ============

  /**
   * Get all active IP risks
   */
  async getAllActiveIpRisks(): Promise<RiskScoreResult[]> {
    const activeIps = await this.riskTrackingService.getActiveIps();

    const results = await Promise.all(
      activeIps.map((ip) => this.riskScoringService.calculateRiskScore(ip)),
    );

    return results
      .filter((r) => r.breakdown.failedCount > 0)
      .sort((a, b) => b.score - a.score);
  }

  /**
   * Get all active fingerprint risks
   */
  async getAllActiveFingerprintRisks(): Promise<FingerprintRiskResult[]> {
    const activeFingerprints =
      await this.riskTrackingService.getActiveFingerprints();

    const results = await Promise.all(
      activeFingerprints.map((fp) =>
        this.riskScoringService.calculateFingerprintRiskScore(fp),
      ),
    );

    return results
      .filter((r) => r.breakdown.failedCount > 0)
      .sort((a, b) => b.score - a.score);
  }

  /**
   * Get all active email risks (accounts under attack)
   */
  async getAllActiveEmailRisks(): Promise<EmailRiskResult[]> {
    const activeEmails = await this.riskTrackingService.getActiveEmails();

    const results = await Promise.all(
      activeEmails.map((email) =>
        this.riskScoringService.calculateEmailRiskScore(email),
      ),
    );

    return results
      .filter((r) => r.breakdown.failedCount > 0)
      .sort((a, b) => b.score - a.score);
  }

  /**
   * Get risk info for a specific IP
   */
  async getRiskByIp(ip: string): Promise<RiskScoreResult> {
    return this.riskScoringService.calculateRiskScore(ip);
  }

  /**
   * Get risk info for a specific fingerprint
   */
  async getRiskByFingerprint(
    fingerprint: string,
  ): Promise<FingerprintRiskResult> {
    return this.riskScoringService.calculateFingerprintRiskScore(fingerprint);
  }

  /**
   * Get risk info for a specific email
   */
  async getRiskByEmail(email: string): Promise<EmailRiskResult> {
    return this.riskScoringService.calculateEmailRiskScore(email);
  }

  /**
   * Get comprehensive risk summary
   */
  async getSummary(): Promise<RiskSummary> {
    const [ipRisks, fpRisks, emailRisks] = await Promise.all([
      this.getAllActiveIpRisks(),
      this.getAllActiveFingerprintRisks(),
      this.getAllActiveEmailRisks(),
    ]);

    return {
      ip: {
        total: ipRisks.length,
        high: ipRisks.filter((r) => r.level === RiskLevel.HIGH).length,
        medium: ipRisks.filter((r) => r.level === RiskLevel.MEDIUM).length,
        low: ipRisks.filter((r) => r.level === RiskLevel.LOW).length,
      },
      fingerprint: {
        total: fpRisks.length,
        high: fpRisks.filter((r) => r.level === RiskLevel.HIGH).length,
        medium: fpRisks.filter((r) => r.level === RiskLevel.MEDIUM).length,
        low: fpRisks.filter((r) => r.level === RiskLevel.LOW).length,
      },
      email: {
        total: emailRisks.length,
        high: emailRisks.filter((r) => r.level === RiskLevel.HIGH).length,
        medium: emailRisks.filter((r) => r.level === RiskLevel.MEDIUM).length,
        low: emailRisks.filter((r) => r.level === RiskLevel.LOW).length,
      },
    };
  }

  // ============ LEGACY API (Backward Compatibility) ============

  /**
   * @deprecated Use getAllActiveIpRisks() instead
   */
  async getAllActiveRisks(): Promise<RiskScoreResult[]> {
    return this.getAllActiveIpRisks();
  }
}
