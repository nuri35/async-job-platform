import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { Job, JobStatus } from '@app/common';
import { JobsService } from './jobs.service';
import { CreateJobDto, UpdateJobDto } from './dto';

@ApiTags('Jobs')
@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new job' })
  @ApiResponse({ status: 201, description: 'Job created successfully' })
  async create(@Body() createJobDto: CreateJobDto): Promise<Job> {
    return this.jobsService.create(createJobDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all jobs' })
  @ApiResponse({ status: 200, description: 'List of all jobs' })
  @ApiQuery({ name: 'status', required: false, enum: JobStatus })
  async findAll(@Query('status') status?: JobStatus): Promise<Job[]> {
    if (status) {
      return this.jobsService.findByStatus(status);
    }
    return this.jobsService.findAll();
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get job statistics' })
  @ApiResponse({ status: 200, description: 'Job statistics by status' })
  async getStats(): Promise<Record<string, number>> {
    return this.jobsService.getStats();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a job by ID' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Job found' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<Job> {
    return this.jobsService.findOne(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a job' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Job updated successfully' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateJobDto: UpdateJobDto,
  ): Promise<Job> {
    return this.jobsService.update(id, updateJobDto);
  }

  @Post(':id/retry')
  @ApiOperation({ summary: 'Retry a failed job' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Job queued for retry' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  async retry(@Param('id', ParseUUIDPipe) id: string): Promise<Job> {
    return this.jobsService.retry(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a job' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Job deleted successfully' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  async delete(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.jobsService.delete(id);
  }
}
