import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class ResendVerificationDto {
  @ApiProperty({
    example: 'user@example.com',
    description: 'Email address to resend verification to',
  })
  @IsEmail()
  email: string;
}
