import { Injectable } from '@nestjs/common';
import { RiskTrackingService } from './risk-tracking.service';

export enum RiskLevel {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
}

export enum AttackType {
  NONE = 'NONE',
  BRUTE_FORCE = 'BRUTE_FORCE', // Tek hesaba saldırı
  CREDENTIAL_STUFFING = 'CREDENTIAL_STUFFING', // Çok hesaba saldırı
}

export interface RiskScoreResult {
  ip: string;
  score: number; // 0-100
  level: RiskLevel;
  attackType: AttackType;
  breakdown: {
    failedCount: number;
    failedScore: number; // failed × 5 (max 50)
    targetCount: number;
    targetScore: number; // (targetCount - 1) × 15 (max 45)
  };
  targets: string[]; // Hedef email listesi
  previousLevel: RiskLevel | null;
  levelChanged: boolean;
}

@Injectable()
export class RiskScoringService {
  // Skor ağırlıkları
  private readonly FAILED_MULTIPLIER = 5; // Her failed = 5 puan
  private readonly FAILED_MAX = 50; // Max 50 puan (10 failed)
  private readonly TARGET_MULTIPLIER = 15; // Her ekstra hedef = 15 puan
  private readonly TARGET_MAX = 45; // Max 45 puan (4+ hedef)

  // Level eşikleri
  private readonly MEDIUM_THRESHOLD = 25; // 25+ = MEDIUM
  private readonly HIGH_THRESHOLD = 50; // 50+ = HIGH

  // Sliding window süresi
  private readonly WINDOW_MINUTES = 10;

  constructor(private readonly riskTrackingService: RiskTrackingService) {}

  /**
   * IP için risk skoru hesapla
   */
  async calculateRiskScore(ip: string): Promise<RiskScoreResult> {
    // 1. Verileri al
    const [failedCount, targetCount, targets, previousLevel] =
      await Promise.all([
        this.riskTrackingService.getFailedCountByIp(ip, this.WINDOW_MINUTES),
        this.riskTrackingService.getTargetCountByIp(ip),
        this.riskTrackingService.getTargetsByIp(ip),
        this.riskTrackingService.getRiskLevel(ip),
      ]);

    // 2. Skorları hesapla
    const failedScore = Math.min(
      failedCount * this.FAILED_MULTIPLIER,
      this.FAILED_MAX,
    );
    const targetScore =
      targetCount > 1
        ? Math.min((targetCount - 1) * this.TARGET_MULTIPLIER, this.TARGET_MAX)
        : 0;

    const totalScore = Math.min(failedScore + targetScore, 100);

    // 3. Level belirle
    const level = this.determineLevel(totalScore);

    // 4. Saldırı tipi belirle
    const attackType = this.determineAttackType(failedCount, targetCount);

    // 5. Level değişti mi?
    const prevLevel = previousLevel as RiskLevel | null;
    const levelChanged = prevLevel !== null && prevLevel !== level;

    return {
      ip,
      score: totalScore,
      level,
      attackType,
      breakdown: {
        failedCount,
        failedScore,
        targetCount,
        targetScore,
      },
      targets,
      previousLevel: prevLevel,
      levelChanged,
    };
  }

  /**
   * Skora göre level belirle
   */
  private determineLevel(score: number): RiskLevel {
    if (score >= this.HIGH_THRESHOLD) {
      return RiskLevel.HIGH;
    }
    if (score >= this.MEDIUM_THRESHOLD) {
      return RiskLevel.MEDIUM;
    }
    return RiskLevel.LOW;
  }

  /**
   * Saldırı tipini belirle
   */
  private determineAttackType(
    failedCount: number,
    targetCount: number,
  ): AttackType {
    if (failedCount < 3) {
      return AttackType.NONE; // Henüz saldırı sayılmaz
    }

    if (targetCount > 1) {
      return AttackType.CREDENTIAL_STUFFING; // Çok hesaba saldırı
    }

    return AttackType.BRUTE_FORCE; // Tek hesaba saldırı
  }

  /**
   * Level değişikliği için karşılaştırma
   */
  isLevelEscalated(oldLevel: RiskLevel | null, newLevel: RiskLevel): boolean {
    if (oldLevel === null) return newLevel !== RiskLevel.LOW;

    const levelOrder = { LOW: 0, MEDIUM: 1, HIGH: 2 };
    return levelOrder[newLevel] > levelOrder[oldLevel];
  }

  /**
   * Level değişikliği için karşılaştırma (düşüş)
   */
  isLevelDeescalated(oldLevel: RiskLevel | null, newLevel: RiskLevel): boolean {
    if (oldLevel === null) return false;

    const levelOrder = { LOW: 0, MEDIUM: 1, HIGH: 2 };
    return levelOrder[newLevel] < levelOrder[oldLevel];
  }
}
