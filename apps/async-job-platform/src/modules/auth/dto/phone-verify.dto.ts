import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, Length } from 'class-validator';

export class SendPhoneCodeDto {
  @ApiProperty({ example: '+905551234567' })
  @IsString()
  @Matches(/^\+[1-9]\d{10,14}$/, {
    message: 'Phone must be in international format (e.g., +905551234567)',
  })
  phone: string;
}

export class VerifyPhoneCodeDto {
  @ApiProperty({ example: '+905551234567' })
  @IsString()
  @Matches(/^\+[1-9]\d{10,14}$/, {
    message: 'Phone must be in international format (e.g., +905551234567)',
  })
  phone: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @Length(6, 6, { message: 'Code must be 6 digits' })
  code: string;
}
