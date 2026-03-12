import { Test, TestingModule } from '@nestjs/testing';
import { EmailQueueService } from './email-queue.service';
import { RMQ_TOKENS, ROUTING_KEYS } from '@app/common';

describe('EmailQueueService', () => {
  let service: EmailQueueService;
  let mockClient: { emit: jest.Mock };

  beforeEach(async () => {
    mockClient = {
      emit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailQueueService,
        {
          provide: RMQ_TOKENS.EMAIL,
          useValue: mockClient,
        },
      ],
    }).compile();

    service = module.get<EmailQueueService>(EmailQueueService);
  });

  describe('publishLockNotification', () => {
    it('should emit to the correct routing key (ROUTING_KEYS.EMAIL_LOCK)', () => {
      service.publishLockNotification('test@test.com');

      expect(mockClient.emit).toHaveBeenCalledTimes(1);
      expect(mockClient.emit).toHaveBeenCalledWith(
        ROUTING_KEYS.EMAIL_LOCK,
        expect.objectContaining({
          email: 'test@test.com',
          timestamp: expect.any(String),
        }),
      );
    });

    it('should use "email.lock" as routing key', () => {
      service.publishLockNotification('user@example.com');

      const [routingKey] = mockClient.emit.mock.calls[0];
      expect(routingKey).toBe('email.lock');
    });

    it('should include ISO timestamp in the payload', () => {
      const before = new Date().toISOString();
      service.publishLockNotification('test@test.com');
      const after = new Date().toISOString();

      const [, payload] = mockClient.emit.mock.calls[0];
      expect(payload.timestamp).toBeDefined();
      expect(payload.timestamp >= before).toBe(true);
      expect(payload.timestamp <= after).toBe(true);
    });

    it('should be fire-and-forget (void return, no await)', () => {
      const result = service.publishLockNotification('test@test.com');

      // Method returns void, not a Promise
      expect(result).toBeUndefined();
    });
  });
});
