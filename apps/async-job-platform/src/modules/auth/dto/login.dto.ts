import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, IsNotEmpty } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Password123' })
  @IsString()
  @IsNotEmpty()
  password: string;

  @ApiProperty({
    example: 'd4e5f6a7b8c9',
    description: 'Device fingerprint for session tracking',
  })
  @IsString()
  @IsNotEmpty()
  deviceFingerprint: string;

  @ApiProperty({
    example: 'Chrome - Windows',
    description: 'Human readable device name',
  })
  @IsString()
  @IsNotEmpty()
  deviceName: string;
}
