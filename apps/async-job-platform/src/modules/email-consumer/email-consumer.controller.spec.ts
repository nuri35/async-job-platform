import { Test, TestingModule } from '@nestjs/testing';
import { EmailConsumerController } from './email-consumer.controller';
import { EmailService, RMQ_MAX_RETRIES } from '@app/common';

describe('EmailConsumerController', () => {
  let controller: EmailConsumerController;
  let emailService: { sendMail: jest.Mock };
  let mockChannel: { ack: jest.Mock; nack: jest.Mock };

  const createMockMessage = (retryCount = 0) => ({
    properties: {
      headers: {
        'x-death': retryCount > 0 ? [{ count: retryCount }] : undefined,
      },
    },
  });

  const createMockContext = (retryCount = 0) => {
    const message = createMockMessage(retryCount);
    mockChannel = { ack: jest.fn(), nack: jest.fn() };
    return {
      getChannelRef: jest.fn().mockReturnValue(mockChannel),
      getMessage: jest.fn().mockReturnValue(message),
    } as any;
  };

  beforeEach(async () => {
    jest.useFakeTimers();
    emailService = { sendMail: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [EmailConsumerController],
      providers: [
        {
          provide: EmailService,
          useValue: emailService,
        },
      ],
    }).compile();

    controller = module.get<EmailConsumerController>(EmailConsumerController);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('handleLockNotification', () => {
    const payload = {
      email: 'test@test.com',
      timestamp: new Date().toISOString(),
    };

    describe('success', () => {
      it('should call emailService.sendMail with correct parameters', async () => {
        emailService.sendMail.mockResolvedValue(undefined);
        const ctx = createMockContext(0);

        await controller.handleLockNotification(payload, ctx);

        expect(emailService.sendMail).toHaveBeenCalledTimes(1);
        expect(emailService.sendMail).toHaveBeenCalledWith(
          'test@test.com',
          'Account Locked - Security Alert',
          expect.stringContaining('temporarily locked'),
        );
      });

      it('should acknowledge the message on success', async () => {
        emailService.sendMail.mockResolvedValue(undefined);
        const ctx = createMockContext(0);

        await controller.handleLockNotification(payload, ctx);

        expect(mockChannel.ack).toHaveBeenCalledTimes(1);
        expect(mockChannel.nack).not.toHaveBeenCalled();
      });
    });

    describe('failure with retry (retryCount < MAX_RETRIES)', () => {
      it('should nack with requeue=true on first failure (retryCount=0)', async () => {
        emailService.sendMail.mockRejectedValue(new Error('SMTP error'));
        const ctx = createMockContext(0);

        const promise = controller.handleLockNotification(payload, ctx);
        await jest.advanceTimersByTimeAsync(20000);
        await promise;

        expect(mockChannel.nack).toHaveBeenCalledWith(
          expect.any(Object),
          false,
          true, // requeue
        );
        expect(mockChannel.ack).not.toHaveBeenCalled();
      });

      it('should nack with requeue=true on second failure (retryCount=1)', async () => {
        emailService.sendMail.mockRejectedValue(new Error('SMTP error'));
        const ctx = createMockContext(1);

        const promise = controller.handleLockNotification(payload, ctx);
        await jest.advanceTimersByTimeAsync(20000);
        await promise;

        expect(mockChannel.nack).toHaveBeenCalledWith(
          expect.any(Object),
          false,
          true,
        );
      });

      it('should apply delayed retry before requeue', async () => {
        emailService.sendMail.mockRejectedValue(new Error('SMTP error'));
        const ctx = createMockContext(0);

        const promise = controller.handleLockNotification(payload, ctx);

        // Flush microtasks so the catch block runs and setTimeout is created
        await Promise.resolve();
        await Promise.resolve();

        // Before timer advances, nack should not have been called yet
        expect(mockChannel.nack).not.toHaveBeenCalled();

        await jest.advanceTimersByTimeAsync(20000);
        await promise;

        expect(mockChannel.nack).toHaveBeenCalledWith(
          expect.any(Object),
          false,
          true,
        );
      });
    });

    describe('failure sent to DLQ (retryCount >= MAX_RETRIES)', () => {
      it('should nack with requeue=false when retryCount+1 >= RMQ_MAX_RETRIES', async () => {
        emailService.sendMail.mockRejectedValue(new Error('SMTP error'));
        // retryCount = RMQ_MAX_RETRIES - 1 = 2 → retryCount+1 = 3 >= 3
        const ctx = createMockContext(RMQ_MAX_RETRIES - 1);

        await controller.handleLockNotification(payload, ctx);

        expect(mockChannel.nack).toHaveBeenCalledWith(
          expect.any(Object),
          false,
          false, // requeue=false → DLQ
        );
      });

      it('should nack with requeue=false when retryCount exceeds MAX_RETRIES', async () => {
        emailService.sendMail.mockRejectedValue(new Error('SMTP error'));
        const ctx = createMockContext(RMQ_MAX_RETRIES + 5);

        await controller.handleLockNotification(payload, ctx);

        expect(mockChannel.nack).toHaveBeenCalledWith(
          expect.any(Object),
          false,
          false,
        );
      });

      it('should not requeue the message when sent to DLQ', async () => {
        emailService.sendMail.mockRejectedValue(new Error('SMTP error'));
        const ctx = createMockContext(RMQ_MAX_RETRIES - 1);

        await controller.handleLockNotification(payload, ctx);

        const nackCall = mockChannel.nack.mock.calls[0];
        expect(nackCall[2]).toBe(false);
      });
    });

    describe('x-death header edge cases', () => {
      it('should treat missing x-death as retryCount=0', async () => {
        emailService.sendMail.mockRejectedValue(new Error('fail'));
        const message = { properties: { headers: {} } };
        mockChannel = { ack: jest.fn(), nack: jest.fn() };
        const ctx = {
          getChannelRef: jest.fn().mockReturnValue(mockChannel),
          getMessage: jest.fn().mockReturnValue(message),
        } as any;

        const promise = controller.handleLockNotification(payload, ctx);
        await jest.advanceTimersByTimeAsync(20000);
        await promise;

        // retryCount=0, 0+1=1 < 3 → requeue
        expect(mockChannel.nack).toHaveBeenCalledWith(
          expect.any(Object),
          false,
          true,
        );
      });

      it('should treat missing headers as retryCount=0', async () => {
        emailService.sendMail.mockRejectedValue(new Error('fail'));
        const message = { properties: {} };
        mockChannel = { ack: jest.fn(), nack: jest.fn() };
        const ctx = {
          getChannelRef: jest.fn().mockReturnValue(mockChannel),
          getMessage: jest.fn().mockReturnValue(message),
        } as any;

        const promise = controller.handleLockNotification(payload, ctx);
        await jest.advanceTimersByTimeAsync(20000);
        await promise;

        expect(mockChannel.nack).toHaveBeenCalledWith(
          expect.any(Object),
          false,
          true,
        );
      });
    });
  });
});
