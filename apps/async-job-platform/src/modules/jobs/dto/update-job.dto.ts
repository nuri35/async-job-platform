import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsObject,
  IsNumber,
  IsString,
  Min,
  Max,
} from 'class-validator';
import { JobStatus } from '@app/common';

export class UpdateJobDto {
  @ApiPropertyOptional({ enum: JobStatus, description: 'Job status' })
  @IsOptional()
  @IsEnum(JobStatus)
  status?: JobStatus;

  @ApiPropertyOptional({ description: 'Job progress (0-100)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  progress?: number;

  @ApiPropertyOptional({
    description: 'Job result data',
    additionalProperties: true,
  })
  @IsOptional()
  @IsObject()
  result?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Error message if job failed' })
  @IsOptional()
  @IsString()
  errorMessage?: string;
}
