import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Repository,
  DeepPartial,
  Between,
  LessThan,
  MoreThanOrEqual,
} from 'typeorm';
import { LoginHistory, LoginStatus } from '@app/common';
import {
  ILoginHistoryRepository,
  LoginHistoryQueryOptions,
  LoginHistoryStats,
} from './login-history.repository.interface';

interface StatusCountRow {
  status: LoginStatus;
  count: string;
}

@Injectable()
export class LoginHistoryRepository implements ILoginHistoryRepository {
  constructor(
    @InjectRepository(LoginHistory)
    private readonly repository: Repository<LoginHistory>,
  ) {}

  create(data: DeepPartial<LoginHistory>): LoginHistory {
    return this.repository.create(data);
  }

  async save(entity: LoginHistory): Promise<LoginHistory> {
    return this.repository.save(entity);
  }

  async findById(id: string): Promise<LoginHistory | null> {
    return this.repository.findOne({
      where: { id },
      relations: ['user'],
    });
  }

  async findByUserId(
    userId: string,
    limit = 20,
    offset = 0,
  ): Promise<LoginHistory[]> {
    return this.repository.find({
      where: { userId },
      order: { loggedAt: 'DESC' },
      take: limit,
      skip: offset,
    });
  }

  async findByQuery(
    options: LoginHistoryQueryOptions,
  ): Promise<LoginHistory[]> {
    const queryBuilder = this.repository.createQueryBuilder('login_history');

    if (options.userId) {
      queryBuilder.andWhere('login_history.userId = :userId', {
        userId: options.userId,
      });
    }

    if (options.status) {
      queryBuilder.andWhere('login_history.status = :status', {
        status: options.status,
      });
    }

    if (options.startDate && options.endDate) {
      queryBuilder.andWhere(
        'login_history.loggedAt BETWEEN :startDate AND :endDate',
        {
          startDate: options.startDate,
          endDate: options.endDate,
        },
      );
    } else if (options.startDate) {
      queryBuilder.andWhere('login_history.loggedAt >= :startDate', {
        startDate: options.startDate,
      });
    } else if (options.endDate) {
      queryBuilder.andWhere('login_history.loggedAt <= :endDate', {
        endDate: options.endDate,
      });
    }

    queryBuilder.orderBy('login_history.loggedAt', 'DESC');

    if (options.limit) {
      queryBuilder.take(options.limit);
    }

    if (options.offset) {
      queryBuilder.skip(options.offset);
    }

    return queryBuilder.getMany();
  }

  async countByUserId(userId: string): Promise<number> {
    return this.repository.count({ where: { userId } });
  }

  async countByStatus(
    status: LoginStatus,
    startDate?: Date,
    endDate?: Date,
  ): Promise<number> {
    const where: Record<string, unknown> = { status };

    if (startDate && endDate) {
      where.loggedAt = Between(startDate, endDate);
    } else if (startDate) {
      where.loggedAt = MoreThanOrEqual(startDate);
    }

    return this.repository.count({ where });
  }

  async getStatsByDateRange(
    startDate: Date,
    endDate: Date,
  ): Promise<LoginHistoryStats> {
    const result = await this.repository
      .createQueryBuilder('login_history')
      .select('login_history.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('login_history.loggedAt BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      })
      .groupBy('login_history.status')
      .getRawMany<StatusCountRow>();

    const stats: LoginHistoryStats = {
      total: 0,
      success: 0,
      failed: 0,
    };

    for (const row of result) {
      const count = parseInt(row.count, 10);
      stats.total += count;
      if (row.status === LoginStatus.SUCCESS) {
        stats.success = count;
      } else if (row.status === LoginStatus.FAILED) {
        stats.failed = count;
      }
    }

    return stats;
  }

  async getStatsByUserId(userId: string): Promise<LoginHistoryStats> {
    const result = await this.repository
      .createQueryBuilder('login_history')
      .select('login_history.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('login_history.userId = :userId', { userId })
      .groupBy('login_history.status')
      .getRawMany<StatusCountRow>();

    const stats: LoginHistoryStats = {
      total: 0,
      success: 0,
      failed: 0,
    };

    for (const row of result) {
      const count = parseInt(row.count, 10);
      stats.total += count;
      if (row.status === LoginStatus.SUCCESS) {
        stats.success = count;
      } else if (row.status === LoginStatus.FAILED) {
        stats.failed = count;
      }
    }

    return stats;
  }

  async findLastSuccessfulLogin(userId: string): Promise<LoginHistory | null> {
    return this.repository.findOne({
      where: { userId, status: LoginStatus.SUCCESS },
      order: { loggedAt: 'DESC' },
    });
  }

  async findFailedLoginsByIp(
    ipAddress: string,
    since: Date,
  ): Promise<LoginHistory[]> {
    return this.repository.find({
      where: {
        ipAddress,
        status: LoginStatus.FAILED,
        loggedAt: MoreThanOrEqual(since),
      },
      order: { loggedAt: 'DESC' },
    });
  }

  async deleteOlderThan(date: Date): Promise<number> {
    const result = await this.repository.delete({
      loggedAt: LessThan(date),
    });
    return result.affected ?? 0;
  }
}
