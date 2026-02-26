import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class RefreshTokenDto {
  @ApiPropertyOptional({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    description: 'Refresh token (if not sent via cookie)',
  })
  @IsString()
  @IsOptional()
  refreshToken?: string;
}

export class TokensResponseDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  accessToken: string;

  @ApiProperty({ example: 900, description: 'Token expiration in seconds' })
  expiresIn: number;

  @ApiProperty({ example: 'Bearer' })
  tokenType: string;
}

export class SessionDto {
  @ApiProperty({ example: 'uuid' })
  id: string;

  @ApiProperty({ example: '192.168.1.1' })
  ipAddress: string | null;

  @ApiProperty({ example: 'Mozilla/5.0 ...' })
  userAgent: string | null;

  @ApiProperty({ example: '2024-01-15T10:00:00Z' })
  createdAt: Date;

  @ApiProperty({ example: true })
  current: boolean;
}
