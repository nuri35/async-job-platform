import { DeepPartial } from 'typeorm';
import { RefreshToken } from '@app/common';

export abstract class IRefreshTokenRepository {
  abstract create(data: DeepPartial<RefreshToken>): RefreshToken;
  abstract save(entity: RefreshToken): Promise<RefreshToken>;
  abstract findById(id: string): Promise<RefreshToken | null>;
  abstract findByTokenHash(tokenHash: string): Promise<RefreshToken | null>;
  abstract findActiveByUserId(userId: string): Promise<RefreshToken[]>;
  abstract countActiveByUserId(userId: string): Promise<number>;
  abstract revokeById(id: string): Promise<void>;
  abstract revokeAllByUserId(userId: string): Promise<void>;
  abstract deleteExpired(): Promise<void>;
}
