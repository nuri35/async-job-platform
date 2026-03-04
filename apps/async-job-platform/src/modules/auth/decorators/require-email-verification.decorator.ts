import { applyDecorators, UseGuards } from '@nestjs/common';
import { EmailVerifiedGuard } from '../guards/email-verified.guard';

export function RequireEmailVerification() {
  return applyDecorators(UseGuards(EmailVerifiedGuard));
}
