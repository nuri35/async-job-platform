import { Module } from '@nestjs/common';
import { EmailService } from '@app/common';
import { EmailConsumerController } from './email-consumer.controller';

@Module({
  controllers: [EmailConsumerController],
  providers: [EmailService],
})
export class EmailConsumerModule {}
