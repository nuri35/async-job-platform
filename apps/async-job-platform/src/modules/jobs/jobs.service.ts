import { Injectable, NotFoundException } from '@nestjs/common';
import { Job, JobStatus } from '@app/common';
import { CreateJobDto, UpdateJobDto } from './dto';
import { IJobsRepository } from './repositories';

@Injectable()
export class JobsService {
  constructor(private readonly jobsRepository: IJobsRepository) {}

  async create(createJobDto: CreateJobDto): Promise<Job> {
    const job = this.jobsRepository.create({
      type: createJobDto.type,
      payload: createJobDto.payload,
      maxRetries: createJobDto.maxRetries ?? 3,
      status: JobStatus.QUEUED,
    });
    return this.jobsRepository.save(job);
  }

  async findAll(): Promise<Job[]> {
    return this.jobsRepository.findAllOrderByCreatedAt('DESC');
  }

  async findOne(id: string): Promise<Job> {
    const job = await this.jobsRepository.findById(id);
    if (!job) {
      throw new NotFoundException(`Job with ID ${id} not found`);
    }
    return job;
  }

  async findByStatus(status: JobStatus): Promise<Job[]> {
    return this.jobsRepository.findByStatus(status);
  }

  async update(id: string, updateJobDto: UpdateJobDto): Promise<Job> {
    const job = await this.findOne(id);

    if (updateJobDto.status) {
      job.status = updateJobDto.status;

      if (updateJobDto.status === JobStatus.PROCESSING && !job.startedAt) {
        job.startedAt = new Date();
      }

      if ([JobStatus.SUCCESS, JobStatus.FAILED].includes(updateJobDto.status)) {
        job.completedAt = new Date();
      }
    }

    if (updateJobDto.progress !== undefined) {
      job.progress = updateJobDto.progress;
    }

    if (updateJobDto.result) {
      job.result = updateJobDto.result;
    }

    if (updateJobDto.errorMessage) {
      job.errorMessage = updateJobDto.errorMessage;
    }

    return this.jobsRepository.save(job);
  }

  async retry(id: string): Promise<Job> {
    const job = await this.findOne(id);

    if (job.retryCount >= job.maxRetries) {
      throw new Error('Max retries exceeded');
    }

    const retriedJob = await this.jobsRepository.incrementRetryCount(id);
    if (!retriedJob) {
      throw new NotFoundException(`Job with ID ${id} not found`);
    }

    return retriedJob;
  }

  async delete(id: string): Promise<void> {
    const deleted = await this.jobsRepository.delete(id);
    if (!deleted) {
      throw new NotFoundException(`Job with ID ${id} not found`);
    }
  }

  async getStats(): Promise<Record<string, number>> {
    return this.jobsRepository.getStats();
  }

  // Worker-specific methods
  async acquireNextJob(): Promise<Job | null> {
    const pendingJob = await this.jobsRepository.findNextPendingJob();
    if (!pendingJob) {
      return null;
    }
    return this.jobsRepository.acquireJob(pendingJob.id);
  }

  async getQueueLength(): Promise<number> {
    return this.jobsRepository.getQueueLength();
  }
}
