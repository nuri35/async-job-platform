import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DeepPartial, IsNull, LessThan } from 'typeorm';
import { RefreshToken } from '@app/common';
import { IRefreshTokenRepository } from './refresh-token.repository.interface';

@Injectable()
export class RefreshTokenRepository implements IRefreshTokenRepository {
  constructor(
    @InjectRepository(RefreshToken)
    private readonly repository: Repository<RefreshToken>,
  ) {}

  create(data: DeepPartial<RefreshToken>): RefreshToken {
    return this.repository.create(data);
  }

  async save(entity: RefreshToken): Promise<RefreshToken> {
    return this.repository.save(entity);
  }

  async findById(id: string): Promise<RefreshToken | null> {
    return this.repository.findOne({
      where: { id, revokedAt: IsNull() },
    });
  }

  async findByTokenHash(tokenHash: string): Promise<RefreshToken | null> {
    return this.repository.findOne({
      where: { tokenHash, revokedAt: IsNull() },
      relations: ['user'],
    });
  }

  async findActiveByUserId(userId: string): Promise<RefreshToken[]> {
    return this.repository.find({
      where: { userId, revokedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });
  }

  async countActiveByUserId(userId: string): Promise<number> {
    return this.repository.count({
      where: { userId, revokedAt: IsNull() },
    });
  }

  async revokeById(id: string): Promise<void> {
    await this.repository.update(id, { revokedAt: new Date() });
  }

  async revokeAllByUserId(userId: string): Promise<void> {
    await this.repository.update(
      { userId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  async revokeByDeviceFingerprint(
    userId: string,
    deviceFingerprint: string,
  ): Promise<void> {
    await this.repository.update(
      { userId, deviceFingerprint, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  async deleteExpired(): Promise<void> {
    await this.repository.delete({
      expiresAt: LessThan(new Date()),
    });
  }
}
