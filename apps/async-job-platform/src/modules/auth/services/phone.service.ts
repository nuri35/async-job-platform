import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Twilio } from 'twilio';
import { IPhoneVerificationRepository, IUserRepository } from '../repositories';
import { SessionService } from './session.service';

@Injectable()
export class PhoneService {
  private readonly logger = new Logger(PhoneService.name);
  private readonly twilioClient: Twilio | null;
  private readonly twilioPhoneNumber: string;
  private readonly CODE_EXPIRY_MINUTES = 5;
  private readonly MAX_ATTEMPTS = 3;
  private readonly SMS_RATE_LIMIT = 3; // max 3 SMS per hour
  private readonly SMS_RATE_WINDOW = 60 * 60; // 1 hour in seconds

  constructor(
    private readonly configService: ConfigService,
    private readonly phoneVerificationRepository: IPhoneVerificationRepository,
    private readonly userRepository: IUserRepository,
    private readonly sessionService: SessionService,
  ) {
    const accountSid = this.configService.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN');
    this.twilioPhoneNumber =
      this.configService.get<string>('TWILIO_PHONE_NUMBER') || '';

    if (accountSid && authToken && !accountSid.startsWith('your-')) {
      this.twilioClient = new Twilio(accountSid, authToken);
    } else {
      this.twilioClient = null;
      this.logger.warn(
        'Twilio credentials not configured. SMS will be logged only.',
      );
    }
  }

  async sendVerificationCode(phone: string): Promise<void> {
    // Rate limit check
    const rateLimitKey = `sms:${phone}`;
    const smsCount = await this.sessionService.incrementRateLimit(
      rateLimitKey,
      this.SMS_RATE_WINDOW,
    );

    if (smsCount > this.SMS_RATE_LIMIT) {
      throw new BadRequestException(
        'Too many SMS requests. Please try again later.',
      );
    }

    // Delete old verifications for this phone
    await this.phoneVerificationRepository.deleteByPhone(phone);

    // Generate 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // Save to database
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + this.CODE_EXPIRY_MINUTES);

    const verification = this.phoneVerificationRepository.create({
      phone,
      code,
      expiresAt,
    });
    await this.phoneVerificationRepository.save(verification);

    // Send SMS
    await this.sendSms(
      phone,
      `Your verification code is: ${code}. It expires in ${this.CODE_EXPIRY_MINUTES} minutes.`,
    );
  }

  async verifyCode(phone: string, code: string): Promise<boolean> {
    const verification =
      await this.phoneVerificationRepository.findLatestByPhone(phone);

    if (!verification) {
      throw new BadRequestException(
        'No verification code found for this phone',
      );
    }

    if (verification.attempts >= this.MAX_ATTEMPTS) {
      throw new BadRequestException(
        'Maximum verification attempts exceeded. Please request a new code.',
      );
    }

    await this.phoneVerificationRepository.incrementAttempts(verification.id);

    if (verification.code !== code) {
      throw new BadRequestException('Invalid verification code');
    }

    // Mark as verified
    await this.phoneVerificationRepository.markAsVerified(verification.id);

    // Update user's phoneVerified status
    const user = await this.userRepository.findByPhone(phone);
    if (user) {
      await this.userRepository.updatePhoneVerified(user.id, true);
    }

    return true;
  }

  private async sendSms(to: string, body: string): Promise<void> {
    if (this.twilioClient) {
      try {
        await this.twilioClient.messages.create({
          body,
          from: this.twilioPhoneNumber,
          to,
        });
        this.logger.log(`SMS sent to ${to}`);
      } catch (error) {
        this.logger.error(`Failed to send SMS to ${to}:`, error);
        throw new BadRequestException('Failed to send SMS. Please try again.');
      }
    } else {
      // Development mode - just log the code
      this.logger.warn(`[DEV MODE] SMS to ${to}: ${body}`);
    }
  }
}
