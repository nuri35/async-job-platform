import { ExceptionFilter, Catch, ArgumentsHost } from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { LoginThrottleException } from './login-throttle.exception';

@Catch(LoginThrottleException)
export class LoginThrottleExceptionFilter implements ExceptionFilter {
  catch(exception: LoginThrottleException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();

    reply.status(429).header('Retry-After', String(exception.retryAfter)).send({
      statusCode: 429,
      message: 'Too many login attempts',
      retryAfter: exception.retryAfter,
    });
  }
}
