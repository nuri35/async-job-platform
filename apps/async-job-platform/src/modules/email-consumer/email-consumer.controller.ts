import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload, Ctx, RmqContext } from '@nestjs/microservices';
import {
  EmailService,
  ROUTING_KEYS,
  RMQ_MAX_RETRIES,
  RMQ_RETRY_DELAYS,
} from '@app/common';

interface RmqMessage {
  properties?: {
    headers?: {
      'x-death'?: Array<{ count: number }>;
    };
  };
}

interface RmqChannel {
  ack(message: RmqMessage): void;
  nack(message: RmqMessage, allUpTo: boolean, requeue: boolean): void;
}

@Controller()
export class EmailConsumerController {
  private readonly logger = new Logger(EmailConsumerController.name);

  constructor(private readonly emailService: EmailService) {}

  @EventPattern(ROUTING_KEYS.EMAIL_LOCK)
  async handleLockNotification(
    @Payload() data: { email: string; timestamp: string },
    @Ctx() context: RmqContext,
  ) {
    const channel: RmqChannel = context.getChannelRef() as RmqChannel;
    const message: RmqMessage = context.getMessage() as RmqMessage;

    // Retry count — RabbitMQ her nack+requeue'da x-death header'ına yazar
    const deaths = message.properties?.headers?.['x-death'];
    const retryCount = deaths?.[0]?.count ?? 0;

    try {
      await this.emailService.sendMail(
        data.email,
        'Account Locked - Security Alert',
        `<p>Your account has been temporarily locked due to multiple failed login attempts.</p>
         <p>If this wasn't you, please reset your password immediately.</p>
         <p>The lock will automatically expire in 15 minutes.</p>`,
      );

      this.logger.log(`Lock notification sent to: ${data.email}`);
      channel.ack(message);
    } catch {
      if (retryCount + 1 >= RMQ_MAX_RETRIES) {
        this.logger.error(
          `Max retries reached for ${data.email}, sending to DLQ`,
        );
        channel.nack(message, false, false);
        return;
      }

      // Delayed retry — bekle, sonra requeue
      const delay = RMQ_RETRY_DELAYS[retryCount] ?? RMQ_RETRY_DELAYS.at(-1);
      this.logger.warn(
        `Retry ${retryCount + 1}/${RMQ_MAX_RETRIES} for ${data.email}, waiting ${delay}ms`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
      channel.nack(message, false, true);
    }
  }
}
