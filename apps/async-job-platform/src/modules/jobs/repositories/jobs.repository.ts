import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job, JobStatus, BaseRepository } from '@app/common';
import { IJobsRepository } from './jobs.repository.interface';

@Injectable()
export class JobsRepository
  extends BaseRepository<Job>
  implements IJobsRepository
{
  constructor(
    @InjectRepository(Job)
    repository: Repository<Job>,
  ) {
    super(repository);
  }

  async findNextPendingJob(): Promise<Job | null> {
    return this.repository.findOne({
      where: [{ status: JobStatus.QUEUED }, { status: JobStatus.RETRYING }],
      order: { createdAt: 'ASC' },
    });
  }

  async findByStatus(status: JobStatus): Promise<Job[]> {
    return this.repository.find({
      where: { status },
      order: { createdAt: 'ASC' },
    });
  }

  async findRetryableJobs(): Promise<Job[]> {
    return this.repository
      .createQueryBuilder('job')
      .where('job.status = :status', { status: JobStatus.FAILED })
      .andWhere('job.retryCount < job.maxRetries')
      .orderBy('job.createdAt', 'ASC')
      .getMany();
  }

  async acquireJob(id: string): Promise<Job | null> {
    const result = await this.repository
      .createQueryBuilder()
      .update(Job)
      .set({
        status: JobStatus.PROCESSING,
        startedAt: new Date(),
      })
      .where('id = :id', { id })
      .andWhere('status IN (:...statuses)', {
        statuses: [JobStatus.QUEUED, JobStatus.RETRYING],
      })
      .returning('*')
      .execute();

    if (result.affected === 0) {
      return null;
    }

    return this.findById(id);
  }

  async updateStatus(id: string, status: JobStatus): Promise<Job | null> {
    const job = await this.findById(id);
    if (!job) {
      return null;
    }

    job.status = status;

    if (status === JobStatus.PROCESSING && !job.startedAt) {
      job.startedAt = new Date();
    }

    if ([JobStatus.SUCCESS, JobStatus.FAILED].includes(status)) {
      job.completedAt = new Date();
    }

    return this.save(job);
  }

  async incrementRetryCount(id: string): Promise<Job | null> {
    const job = await this.findById(id);
    if (!job) {
      return null;
    }

    job.retryCount += 1;
    job.status = JobStatus.RETRYING;
    job.errorMessage = null;

    return this.save(job);
  }

  async getStats(): Promise<Record<JobStatus, number>> {
    const stats = await this.repository
      .createQueryBuilder('job')
      .select('job.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('job.status')
      .getRawMany<{ status: JobStatus; count: string }>();

    const allStatuses: JobStatus[] = [
      JobStatus.QUEUED,
      JobStatus.PROCESSING,
      JobStatus.SUCCESS,
      JobStatus.FAILED,
      JobStatus.RETRYING,
    ];

    const result: Record<JobStatus, number> = allStatuses.reduce<
      Record<JobStatus, number>
    >(
      (acc, status) => {
        acc[status] = 0;
        return acc;
      },
      {} as Record<JobStatus, number>,
    );

    stats.forEach(({ status, count }) => {
      result[status] = parseInt(count, 10);
    });

    return result;
  }

  async getQueueLength(): Promise<number> {
    return this.repository.count({
      where: [{ status: JobStatus.QUEUED }, { status: JobStatus.RETRYING }],
    });
  }

  async findAllOrderByCreatedAt(
    order: 'ASC' | 'DESC' = 'DESC',
  ): Promise<Job[]> {
    return this.repository.find({
      order: { createdAt: order },
    });
  }
}
