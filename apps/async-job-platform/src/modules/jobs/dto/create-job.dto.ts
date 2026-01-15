import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsObject,
  IsNumber,
  Min,
  Max,
} from 'class-validator';
import { JobType } from '@app/common';

export class CreateJobDto {
  @ApiProperty({ enum: JobType, description: 'Type of the job' })
  @IsEnum(JobType)
  type: JobType;

  @ApiPropertyOptional({
    description: 'Job payload data',
    additionalProperties: true,
  })
  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;

  @ApiPropertyOptional({ default: 3, description: 'Maximum retry attempts' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  maxRetries?: number;
}
