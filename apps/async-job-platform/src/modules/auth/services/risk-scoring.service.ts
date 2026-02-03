import { Injectable } from '@nestjs/common';
import { RiskTrackingService } from './risk-tracking.service';

export enum RiskLevel {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
}

export enum AttackType {
  NONE = 'NONE',
  BRUTE_FORCE = 'BRUTE_FORCE', // Single account attack from one IP
  CREDENTIAL_STUFFING = 'CREDENTIAL_STUFFING', // Multiple accounts from one IP
  VPN_ROTATION = 'VPN_ROTATION', // Same fingerprint, multiple IPs
  DISTRIBUTED_ATTACK = 'DISTRIBUTED_ATTACK', // Single email targeted by multiple IPs
  BOTNET = 'BOTNET', // Single email targeted by multiple IPs AND fingerprints
}

// ============ IP-Based Result (Existing) ============
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
  targets: string[];
  previousLevel: RiskLevel | null;
  levelChanged: boolean;
}

// ============ Fingerprint-Based Result (New) ============
export interface FingerprintRiskResult {
  fingerprint: string;
  score: number; // 0-100
  level: RiskLevel;
  attackType: AttackType;
  breakdown: {
    failedCount: number;
    failedScore: number; // failed × 5 (max 50)
    ipCount: number;
    ipRotationScore: number; // (ipCount - 1) × 20 (max 60)
    targetCount: number;
    targetScore: number; // (targetCount - 1) × 15 (max 45)
  };
  ips: string[];
  targets: string[];
  previousLevel: RiskLevel | null;
  levelChanged: boolean;
}

// ============ Email-Based Result (New) ============
export interface EmailRiskResult {
  email: string;
  score: number; // 0-100
  level: RiskLevel;
  attackType: AttackType;
  breakdown: {
    failedCount: number;
    failedScore: number; // failed × 5 (max 30)
    attackerIpCount: number;
    attackerIpScore: number; // (ipCount - 1) × 10 (max 50)
    attackerFpCount: number;
    attackerFpScore: number; // (fpCount - 1) × 15 (max 45)
  };
  attackerIps: string[];
  attackerFingerprints: string[];
  previousLevel: RiskLevel | null;
  levelChanged: boolean;
}

@Injectable()
export class RiskScoringService {
  // ============ Score Weights ============

  // IP-based scoring
  private readonly FAILED_MULTIPLIER = 5; // Each failed = 5 points
  private readonly FAILED_MAX = 50; // Max 50 points (10 failed)
  private readonly TARGET_MULTIPLIER = 15; // Each extra target = 15 points
  private readonly TARGET_MAX = 45; // Max 45 points (4+ targets)

  // Fingerprint-based scoring (VPN rotation detection)
  private readonly IP_ROTATION_MULTIPLIER = 20; // Each extra IP = 20 points
  private readonly IP_ROTATION_MAX = 60; // Max 60 points (4+ IPs)

  // Email-based scoring (Distributed attack detection)
  private readonly ATTACKER_IP_MULTIPLIER = 10; // Each attacker IP = 10 points
  private readonly ATTACKER_IP_MAX = 50; // Max 50 points (6+ IPs)
  private readonly ATTACKER_FP_MULTIPLIER = 15; // Each attacker FP = 15 points
  private readonly ATTACKER_FP_MAX = 45; // Max 45 points (4+ FPs)
  private readonly EMAIL_FAILED_MAX = 30; // Max 30 points for email failed count

  // Level thresholds
  private readonly MEDIUM_THRESHOLD = 25; // 25+ = MEDIUM
  private readonly HIGH_THRESHOLD = 50; // 50+ = HIGH

  // Sliding window duration
  private readonly WINDOW_MINUTES = 10;

  constructor(private readonly riskTrackingService: RiskTrackingService) {}

  // ============ IP-BASED SCORING (Existing) ============

  /**
   * Calculate risk score for an IP address
   */
  async calculateRiskScore(ip: string): Promise<RiskScoreResult> {
    // 1. Fetch data
    const [failedCount, targetCount, targets, previousLevel] =
      await Promise.all([
        this.riskTrackingService.getFailedCountByIp(ip, this.WINDOW_MINUTES),
        this.riskTrackingService.getTargetCountByIp(ip),
        this.riskTrackingService.getTargetsByIp(ip),
        this.riskTrackingService.getRiskLevel(ip),
      ]);

    // 2. Calculate scores
    const failedScore = Math.min(
      failedCount * this.FAILED_MULTIPLIER,
      this.FAILED_MAX,
    );
    const targetScore =
      targetCount > 1
        ? Math.min((targetCount - 1) * this.TARGET_MULTIPLIER, this.TARGET_MAX)
        : 0;

    const totalScore = Math.min(failedScore + targetScore, 100);

    // 3. Determine level
    const level = this.determineLevel(totalScore);

    // 4. Determine attack type
    const attackType = this.determineIpAttackType(failedCount, targetCount);

    // 5. Check level change
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

  // ============ FINGERPRINT-BASED SCORING (New) ============

  /**
   * Calculate risk score for a fingerprint
   * Detects: VPN/Proxy rotation attacks
   */
  async calculateFingerprintRiskScore(
    fingerprint: string,
  ): Promise<FingerprintRiskResult> {
    // 1. Fetch data
    const [failedCount, ipCount, ips, targetCount, targets, previousLevel] =
      await Promise.all([
        this.riskTrackingService.getFailedCountByFingerprint(
          fingerprint,
          this.WINDOW_MINUTES,
        ),
        this.riskTrackingService.getIpCountByFingerprint(fingerprint),
        this.riskTrackingService.getIpsByFingerprint(fingerprint),
        this.riskTrackingService.getTargetCountByFingerprint(fingerprint),
        this.riskTrackingService.getTargetsByFingerprint(fingerprint),
        this.riskTrackingService.getFingerprintRiskLevel(fingerprint),
      ]);

    // 2. Calculate scores
    const failedScore = Math.min(
      failedCount * this.FAILED_MULTIPLIER,
      this.FAILED_MAX,
    );

    // IP rotation score: More IPs = higher score (VPN detection)
    const ipRotationScore =
      ipCount > 1
        ? Math.min(
            (ipCount - 1) * this.IP_ROTATION_MULTIPLIER,
            this.IP_ROTATION_MAX,
          )
        : 0;

    const targetScore =
      targetCount > 1
        ? Math.min((targetCount - 1) * this.TARGET_MULTIPLIER, this.TARGET_MAX)
        : 0;

    const totalScore = Math.min(
      failedScore + ipRotationScore + targetScore,
      100,
    );

    // 3. Determine level
    const level = this.determineLevel(totalScore);

    // 4. Determine attack type
    const attackType = this.determineFingerprintAttackType(
      failedCount,
      ipCount,
      targetCount,
    );

    // 5. Check level change
    const prevLevel = previousLevel as RiskLevel | null;
    const levelChanged = prevLevel !== null && prevLevel !== level;

    return {
      fingerprint,
      score: totalScore,
      level,
      attackType,
      breakdown: {
        failedCount,
        failedScore,
        ipCount,
        ipRotationScore,
        targetCount,
        targetScore,
      },
      ips,
      targets,
      previousLevel: prevLevel,
      levelChanged,
    };
  }

  // ============ EMAIL-BASED SCORING (New) ============

  /**
   * Calculate risk score for an email (victim protection)
   * Detects: Distributed attacks, Botnet attacks
   */
  async calculateEmailRiskScore(email: string): Promise<EmailRiskResult> {
    // 1. Fetch data
    const [
      failedCount,
      attackerIpCount,
      attackerIps,
      attackerFpCount,
      attackerFps,
      previousLevel,
    ] = await Promise.all([
      this.riskTrackingService.getFailedCountByEmail(
        email,
        this.WINDOW_MINUTES,
      ),
      this.riskTrackingService.getAttackerIpCountByEmail(email),
      this.riskTrackingService.getAttackerIpsByEmail(email),
      this.riskTrackingService.getAttackerFpCountByEmail(email),
      this.riskTrackingService.getAttackerFpsByEmail(email),
      this.riskTrackingService.getEmailRiskLevel(email),
    ]);

    // 2. Calculate scores
    const failedScore = Math.min(
      failedCount * this.FAILED_MULTIPLIER,
      this.EMAIL_FAILED_MAX,
    );

    // Attacker IP score: More IPs attacking = higher score
    const attackerIpScore =
      attackerIpCount > 1
        ? Math.min(
            (attackerIpCount - 1) * this.ATTACKER_IP_MULTIPLIER,
            this.ATTACKER_IP_MAX,
          )
        : 0;

    // Attacker fingerprint score: More devices attacking = higher score
    const attackerFpScore =
      attackerFpCount > 1
        ? Math.min(
            (attackerFpCount - 1) * this.ATTACKER_FP_MULTIPLIER,
            this.ATTACKER_FP_MAX,
          )
        : 0;

    const totalScore = Math.min(
      failedScore + attackerIpScore + attackerFpScore,
      100,
    );

    // 3. Determine level
    const level = this.determineLevel(totalScore);

    // 4. Determine attack type
    const attackType = this.determineEmailAttackType(
      failedCount,
      attackerIpCount,
      attackerFpCount,
    );

    // 5. Check level change
    const prevLevel = previousLevel as RiskLevel | null;
    const levelChanged = prevLevel !== null && prevLevel !== level;

    return {
      email,
      score: totalScore,
      level,
      attackType,
      breakdown: {
        failedCount,
        failedScore,
        attackerIpCount,
        attackerIpScore,
        attackerFpCount,
        attackerFpScore,
      },
      attackerIps,
      attackerFingerprints: attackerFps,
      previousLevel: prevLevel,
      levelChanged,
    };
  }

  // ============ HELPER METHODS ============

  /**
   * Determine risk level based on score
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
   * Determine attack type for IP-based analysis
   */
  private determineIpAttackType(
    failedCount: number,
    targetCount: number,
  ): AttackType {
    if (failedCount < 3) {
      return AttackType.NONE; // Not enough attempts to classify as attack
    }

    if (targetCount > 1) {
      return AttackType.CREDENTIAL_STUFFING; // Multiple accounts targeted
    }

    return AttackType.BRUTE_FORCE; // Single account targeted
  }

  /**
   * Determine attack type for fingerprint-based analysis
   */
  private determineFingerprintAttackType(
    failedCount: number,
    ipCount: number,
    targetCount: number,
  ): AttackType {
    if (failedCount < 3) {
      return AttackType.NONE;
    }

    // VPN rotation: Same fingerprint using multiple IPs
    if (ipCount >= 3) {
      return AttackType.VPN_ROTATION;
    }

    // Credential stuffing: Multiple targets
    if (targetCount > 1) {
      return AttackType.CREDENTIAL_STUFFING;
    }

    return AttackType.BRUTE_FORCE;
  }

  /**
   * Determine attack type for email-based analysis (victim perspective)
   */
  private determineEmailAttackType(
    failedCount: number,
    attackerIpCount: number,
    attackerFpCount: number,
  ): AttackType {
    if (failedCount < 3) {
      return AttackType.NONE;
    }

    // Botnet: Multiple IPs AND multiple fingerprints attacking same email
    if (attackerIpCount >= 3 && attackerFpCount >= 3) {
      return AttackType.BOTNET;
    }

    // Distributed attack: Multiple IPs attacking same email
    if (attackerIpCount >= 3) {
      return AttackType.DISTRIBUTED_ATTACK;
    }

    return AttackType.BRUTE_FORCE;
  }

  /**
   * Check if risk level has escalated
   */
  isLevelEscalated(oldLevel: RiskLevel | null, newLevel: RiskLevel): boolean {
    if (oldLevel === null) return newLevel !== RiskLevel.LOW;

    const levelOrder = { LOW: 0, MEDIUM: 1, HIGH: 2 };
    return levelOrder[newLevel] > levelOrder[oldLevel];
  }

  /**
   * Check if risk level has de-escalated
   */
  isLevelDeescalated(oldLevel: RiskLevel | null, newLevel: RiskLevel): boolean {
    if (oldLevel === null) return false;

    const levelOrder = { LOW: 0, MEDIUM: 1, HIGH: 2 };
    return levelOrder[newLevel] < levelOrder[oldLevel];
  }
}
