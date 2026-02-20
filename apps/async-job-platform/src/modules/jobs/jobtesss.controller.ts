import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { JobsService } from './jobs.service';
import { JobTestResponseDto } from './dto';

@ApiTags('Jobtesss')
@Controller('jobtesss')
export class JobtesssController {
  constructor(private readonly jobsService: JobsService) {}

  @ApiOperation({ summary: 'Get a job by ID (test endpoint)' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Job found',
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    type: JobTestResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Job not found' })
  @Get(':id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<JobTestResponseDto> {
    return this.jobsService.findOne(id);
  }
}
