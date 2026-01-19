import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { timingSafeEqual } from 'crypto';

interface FastifyRequestWithCsrf extends FastifyRequest {
  unsignCookie: (
    value: string,
  ) =>
    | { valid: true; renew: boolean; value: string }
    | { valid: false; renew: false; value: null };
}

@Injectable()
export class CsrfForAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequestWithCsrf>();

    // 1. Header'dan token al (array olabilir, ilkini al)
    const rawHeader = request.headers['x-csrf-token'];
    const headerToken = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;

    if (
      !headerToken ||
      typeof headerToken !== 'string' ||
      !headerToken.trim()
    ) {
      throw new ForbiddenException('CSRF token is missing in header');
    }

    // 2. Cookie'den token al
    const cookieToken = request.cookies?.['csrf-token'];
    if (
      !cookieToken ||
      typeof cookieToken !== 'string' ||
      !cookieToken.trim()
    ) {
      throw new ForbiddenException('CSRF cookie is missing');
    }

    // 3. Signed cookie'yi unsign et
    const unsigned = request.unsignCookie(cookieToken);
    if (!unsigned.valid || !unsigned.value) {
      throw new ForbiddenException('Invalid CSRF cookie signature');
    }

    // 4. Token'ları timing-safe karşılaştır
    try {
      const headerBuffer = Buffer.from(headerToken.trim());
      const cookieBuffer = Buffer.from(unsigned.value);

      if (headerBuffer.length !== cookieBuffer.length) {
        throw new ForbiddenException('Invalid CSRF token');
      }

      if (!timingSafeEqual(headerBuffer, cookieBuffer)) {
        throw new ForbiddenException('Invalid CSRF token');
      }
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error;
      }
      throw new ForbiddenException('CSRF token validation failed');
    }

    return true;
  }
}
