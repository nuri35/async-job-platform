import { Injectable, Inject, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { RMQ_TOKENS, ROUTING_KEYS } from '@app/common';

@Injectable()
export class EmailQueueService {
  private readonly logger = new Logger(EmailQueueService.name);

  constructor(
    @Inject(RMQ_TOKENS.EMAIL)
    private readonly client: ClientProxy,
  ) {}

  /**
   * Account lock notification — routing key: email.lock
   * Topic exchange üzerinden email_queue'ya yönlenir (email.# binding)
   */
  publishLockNotification(email: string): void {
    this.client.emit(ROUTING_KEYS.EMAIL_LOCK, {
      email,
      timestamp: new Date().toISOString(),
    });
    this.logger.debug(`Lock notification queued for: ${email}`);
  }
}
