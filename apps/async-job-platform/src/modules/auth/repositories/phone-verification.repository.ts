import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DeepPartial, LessThan, MoreThan } from 'typeorm';
import { PhoneVerification } from '@app/common';
import { IPhoneVerificationRepository } from './phone-verification.repository.interface';

@Injectable()
export class PhoneVerificationRepository implements IPhoneVerificationRepository {
  constructor(
    @InjectRepository(PhoneVerification)
    private readonly repository: Repository<PhoneVerification>,
  ) {}

  create(data: DeepPartial<PhoneVerification>): PhoneVerification {
    return this.repository.create(data);
  }

  async save(entity: PhoneVerification): Promise<PhoneVerification> {
    return this.repository.save(entity);
  }

  async findLatestByPhone(phone: string): Promise<PhoneVerification | null> {
    return this.repository.findOne({
      where: {
        phone,
        verified: false,
        expiresAt: MoreThan(new Date()),
      },
      order: { createdAt: 'DESC' },
    });
  }

  async incrementAttempts(id: string): Promise<void> {
    await this.repository.increment({ id }, 'attempts', 1);
  }

  async markAsVerified(id: string): Promise<void> {
    await this.repository.update(id, { verified: true });
  }

  async deleteByPhone(phone: string): Promise<void> {
    await this.repository.delete({ phone });
  }

  async deleteExpired(): Promise<void> {
    await this.repository.delete({
      expiresAt: LessThan(new Date()),
    });
  }
}
