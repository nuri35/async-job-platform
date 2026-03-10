import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private readonly configService: ConfigService) {
    const emailEnabled =
      this.configService.get<string>('EMAIL_ENABLED') === 'true';

    if (emailEnabled) {
      this.transporter = nodemailer.createTransport({
        host: this.configService.get<string>('SMTP_HOST'),
        port: Number(this.configService.get<string>('SMTP_PORT') || 587),
        auth: {
          user: this.configService.get<string>('SMTP_USER'),
          pass: this.configService.get<string>('SMTP_PASS'),
        },
      });
    }
  }

  async sendMail(to: string, subject: string, html: string): Promise<void> {
    const from =
      this.configService.get<string>('SMTP_FROM') || 'noreply@app.com';

    if (!this.transporter) {
      this.logger.log(`[DEV EMAIL] To: ${to}`);
      this.logger.log(`[DEV EMAIL] Subject: ${subject}`);
      this.logger.log(`[DEV EMAIL] Body: ${html}`);
      return;
    }

    await this.transporter.sendMail({ from, to, subject, html });
  }
}
