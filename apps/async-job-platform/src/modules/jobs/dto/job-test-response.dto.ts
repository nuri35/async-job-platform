import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsEnum,
  IsObject,
  IsNumber,
  IsDate,
  IsOptional,
  IsUUID,
} from 'class-validator';
import { JobStatus, JobType } from '@app/common';

export class JobTestResponseDto {
  @ApiProperty({ description: 'Unique job identifier', format: 'uuid' })
  @IsUUID()
  id: string;

  @ApiProperty({ enum: JobType, description: 'Type of the job' })
  @IsEnum(JobType)
  type: string;

  @ApiProperty({ enum: JobStatus, description: 'Current job status' })
  @IsEnum(JobStatus)
  status: string;

  @ApiProperty({ description: 'Number of retry attempts' })
  @IsNumber()
  retryCount: number;

  @ApiProperty({ description: 'Maximum allowed retries' })
  @IsNumber()
  maxRetries: number;

  @ApiProperty({ description: 'Job creation timestamp' })
  @IsDate()
  createdAt: Date;

  @ApiProperty({ description: 'Last update timestamp' })
  @IsDate()
  updatedAt: Date;

  @ApiProperty({ description: 'Job payload data', required: false })
  @IsOptional()
  @IsObject()
  payload?: Record<string, any>;

  @ApiProperty({ description: 'Job result data', required: false })
  @IsOptional()
  @IsObject()
  result?: Record<string, any>;

  @ApiProperty({ description: 'Error message if job failed', required: false })
  @IsOptional()
  @IsString()
  errorMessage?: string | null;

  @ApiProperty({ description: 'Job progress percentage', required: false })
  @IsOptional()
  @IsNumber()
  progress?: number;

  @ApiProperty({ description: 'Processing start timestamp', required: false })
  @IsOptional()
  @IsDate()
  startedAt?: Date;

  @ApiProperty({ description: 'Completion timestamp', required: false })
  @IsOptional()
  @IsDate()
  completedAt?: Date;
}
