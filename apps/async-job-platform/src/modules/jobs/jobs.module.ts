import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Job } from '@app/common';
import { JobsController } from './jobs.controller';
import { JobtesssController } from './jobtesss.controller';
import { JobsService } from './jobs.service';
import { JobsRepository, IJobsRepository } from './repositories';

@Module({
  imports: [TypeOrmModule.forFeature([Job])],
  controllers: [JobsController, JobtesssController],
  providers: [
    JobsService,
    {
      provide: IJobsRepository,
      useClass: JobsRepository,
    },
  ],
  exports: [JobsService, IJobsRepository],
})
export class JobsModule {}
