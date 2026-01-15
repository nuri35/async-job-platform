import { DeepPartial, FindOptionsWhere } from 'typeorm';
import { Job, JobStatus } from '@app/common';

export abstract class IJobsRepository {
  // Base repository methods
  abstract create(data: DeepPartial<Job>): Job;
  abstract save(entity: Job): Promise<Job>;
  abstract saveMany(entities: Job[]): Promise<Job[]>;
  abstract findById(id: string): Promise<Job | null>;
  abstract findOne(where: FindOptionsWhere<Job>): Promise<Job | null>;
  abstract findAll(): Promise<Job[]>;
  abstract findBy(where: FindOptionsWhere<Job>): Promise<Job[]>;
  abstract update(id: string, data: DeepPartial<Job>): Promise<Job | null>;
  abstract delete(id: string): Promise<boolean>;
  abstract count(where?: FindOptionsWhere<Job>): Promise<number>;
  abstract exists(where: FindOptionsWhere<Job>): Promise<boolean>;

  // Query operations
  abstract findAllOrderByCreatedAt(order: 'ASC' | 'DESC'): Promise<Job[]>;
  abstract findByStatus(status: JobStatus): Promise<Job[]>;

  // Queue operations
  abstract findNextPendingJob(): Promise<Job | null>;
  abstract findRetryableJobs(): Promise<Job[]>;

  // Atomic updates (for worker race conditions)
  abstract acquireJob(id: string): Promise<Job | null>;
  abstract updateStatus(id: string, status: JobStatus): Promise<Job | null>;
  abstract incrementRetryCount(id: string): Promise<Job | null>;

  // Stats
  abstract getStats(): Promise<Record<JobStatus, number>>;
  abstract getQueueLength(): Promise<number>;
}
