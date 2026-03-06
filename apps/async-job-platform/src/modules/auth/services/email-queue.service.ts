import { Injectable, Inject, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';

@Injectable()
export class EmailQueueService {
  private readonly logger = new Logger(EmailQueueService.name);

  constructor(
    @Inject('EMAIL_SERVICE')
    private readonly client: ClientProxy,
  ) {}

  publishLockNotification(email: string): void {
    this.client.emit('auth.email.lock-notification', {
      email,
      timestamp: new Date().toISOString(),
    });
    this.logger.debug(`Lock notification queued for: ${email}`);
  }
}
