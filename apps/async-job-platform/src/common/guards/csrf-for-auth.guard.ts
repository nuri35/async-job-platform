import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';

@Injectable()
export class CsrfForAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest>();

    const csrfToken = request.headers['x-csrf-token'];

    if (!csrfToken) {
      throw new ForbiddenException('CSRF token is missing');
    }

    // Fastify CSRF plugin ile token doğrulama
    try {
      const isValid = request.server.csrfProtection.verify(
        request.cookies['_csrf'] || '',
        csrfToken as string,
      );

      if (!isValid) {
        throw new ForbiddenException('Invalid CSRF token');
      }
    } catch {
      throw new ForbiddenException('CSRF token validation failed');
    }

    return true;
  }
}
