import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job, JobStatus } from '@app/common';
import { CreateJobDto, UpdateJobDto } from './dto';

@Injectable()
export class JobsService {
  constructor(
    @InjectRepository(Job)
    private readonly jobRepository: Repository<Job>,
  ) {}

  async create(createJobDto: CreateJobDto): Promise<Job> {
    const job = this.jobRepository.create({
      type: createJobDto.type,
      payload: createJobDto.payload,
      maxRetries: createJobDto.maxRetries ?? 3,
      status: JobStatus.QUEUED,
    });
    return this.jobRepository.save(job);
  }

  async findAll(): Promise<Job[]> {
    return this.jobRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Job> {
    const job = await this.jobRepository.findOne({ where: { id } });
    if (!job) {
      throw new NotFoundException(`Job with ID ${id} not found`);
    }
    return job;
  }

  async findByStatus(status: JobStatus): Promise<Job[]> {
    return this.jobRepository.find({
      where: { status },
      order: { createdAt: 'ASC' },
    });
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

    return this.jobRepository.save(job);
  }

  async retry(id: string): Promise<Job> {
    const job = await this.findOne(id);

    if (job.retryCount >= job.maxRetries) {
      throw new Error('Max retries exceeded');
    }

    job.retryCount += 1;
    job.status = JobStatus.RETRYING;
    job.errorMessage = null;

    return this.jobRepository.save(job);
  }

  async delete(id: string): Promise<void> {
    const job = await this.findOne(id);
    await this.jobRepository.remove(job);
  }

  async getStats(): Promise<Record<string, number>> {
    const stats = await this.jobRepository
      .createQueryBuilder('job')
      .select('job.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('job.status')
      .getRawMany<{ status: string; count: string }>();

    return stats.reduce<Record<string, number>>((acc, { status, count }) => {
      acc[status] = parseInt(count, 10);
      return acc;
    }, {});
  }
}
