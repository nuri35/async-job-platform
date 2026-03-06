import { HttpException, HttpStatus } from '@nestjs/common';

export class LoginThrottleException extends HttpException {
  public readonly retryAfter: number;

  constructor(retryAfterSeconds: number) {
    super('Too many login attempts', HttpStatus.TOO_MANY_REQUESTS);
    this.retryAfter = retryAfterSeconds;
  }
}
