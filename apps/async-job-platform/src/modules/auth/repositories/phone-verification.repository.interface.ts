import { DeepPartial } from 'typeorm';
import { PhoneVerification } from '@app/common';

export abstract class IPhoneVerificationRepository {
  abstract create(data: DeepPartial<PhoneVerification>): PhoneVerification;
  abstract save(entity: PhoneVerification): Promise<PhoneVerification>;
  abstract findLatestByPhone(phone: string): Promise<PhoneVerification | null>;
  abstract incrementAttempts(id: string): Promise<void>;
  abstract markAsVerified(id: string): Promise<void>;
  abstract deleteByPhone(phone: string): Promise<void>;
  abstract deleteExpired(): Promise<void>;
}
