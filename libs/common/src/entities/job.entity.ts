import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum JobStatus {
  QUEUED = 'QUEUED',
  PROCESSING = 'PROCESSING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  RETRYING = 'RETRYING',
}

export enum JobType {
  REPORT = 'REPORT',
  IMPORT_CSV = 'IMPORT_CSV',
  WEBHOOK = 'WEBHOOK',
}

@Entity('jobs')
export class Job {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: JobType })
  type: JobType;

  @Column({ type: 'enum', enum: JobStatus, default: JobStatus.QUEUED })
  @Index()
  status: JobStatus;

  @Column({ type: 'jsonb', nullable: true })
  payload: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  result: Record<string, any>;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ default: 0 })
  retryCount: number;

  @Column({ default: 3 })
  maxRetries: number;

  @Column({ type: 'int', nullable: true })
  progress: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  startedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  completedAt: Date;
}
