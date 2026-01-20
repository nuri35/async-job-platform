import { DeepPartial } from 'typeorm';
import { LoginHistory, LoginStatus } from '@app/common';

export interface LoginHistoryQueryOptions {
  userId?: string;
  status?: LoginStatus;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export interface LoginHistoryStats {
  total: number;
  success: number;
  failed: number;
}

export abstract class ILoginHistoryRepository {
  abstract create(data: DeepPartial<LoginHistory>): LoginHistory;
  abstract save(entity: LoginHistory): Promise<LoginHistory>;
  abstract findById(id: string): Promise<LoginHistory | null>;
  abstract findByUserId(
    userId: string,
    limit?: number,
    offset?: number,
  ): Promise<LoginHistory[]>;
  abstract findByQuery(
    options: LoginHistoryQueryOptions,
  ): Promise<LoginHistory[]>;
  abstract countByUserId(userId: string): Promise<number>;
  abstract countByStatus(
    status: LoginStatus,
    startDate?: Date,
    endDate?: Date,
  ): Promise<number>;
  abstract getStatsByDateRange(
    startDate: Date,
    endDate: Date,
  ): Promise<LoginHistoryStats>;
  abstract getStatsByUserId(userId: string): Promise<LoginHistoryStats>;
  abstract findLastSuccessfulLogin(
    userId: string,
  ): Promise<LoginHistory | null>;
  abstract findFailedLoginsByIp(
    ipAddress: string,
    since: Date,
  ): Promise<LoginHistory[]>;
  abstract deleteOlderThan(date: Date): Promise<number>;
}
