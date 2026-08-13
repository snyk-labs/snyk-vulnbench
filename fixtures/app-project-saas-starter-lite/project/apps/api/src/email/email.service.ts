import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { baseTemplate, escapeHtml } from './email-templates';

// Lite version: welcome, password reset, email verification.
// Full version adds magic link, invoice, subscription confirmation,
// team invitation emails, and BullMQ-backed retry queue.
// Get it at: https://demo.cloudrix.io

@Injectable()
export class EmailService {
  private resend: Resend;
  private fromEmail: string;
  private appName: string;
  private readonly logger = new Logger(EmailService.name);

  constructor(private configService: ConfigService) {
    this.resend = new Resend(configService.get('RESEND_API_KEY', 're_placeholder'));
    this.fromEmail = configService.get('RESEND_FROM_EMAIL', 'noreply@yourdomain.com');
    this.appName = configService.get('APP_NAME', 'SaaS Starter Lite');
  }

  async sendEmail(to: string, subject: string, html: string): Promise<void> {
    try {
      await this.resend.emails.send({
        from: `${this.appName} <${this.fromEmail}>`,
        to,
        subject,
        html,
      });
      this.logger.log(`Email sent to ${to}: ${subject}`);
    } catch (error) {
      this.logger.error(`Failed to send email to ${to}: ${error.message}`);
    }
  }

  async sendWelcomeEmail(to: string, firstName: string): Promise<void> {
    const html = baseTemplate(
      `<h2 style="margin: 0 0 16px; color: #0f172a;">Welcome, ${escapeHtml(firstName)}!</h2>
       <p>Thanks for joining ${this.appName}. We're excited to have you on board.</p>
       <p>Here's what you can do next:</p>
       <ul style="padding-left: 20px;">
         <li>Complete your profile</li>
         <li>Explore the dashboard</li>
       </ul>`,
      'Go to Dashboard',
      `${this.configService.get('FRONTEND_URL', 'http://localhost:4200')}/dashboard`,
      this.appName,
    );
    await this.sendEmail(to, `Welcome to ${this.appName}!`, html);
  }

  async sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
    const html = baseTemplate(
      `<h2 style="margin: 0 0 16px; color: #0f172a;">Reset Your Password</h2>
       <p>We received a request to reset your password. Click the button below to choose a new one.</p>
       <p style="color: #94a3b8; font-size: 14px;">This link will expire in 1 hour.</p>`,
      'Reset Password',
      resetUrl,
      this.appName,
    );
    await this.sendEmail(to, 'Reset Your Password', html);
  }

  async sendEmailVerification(to: string, verificationUrl: string): Promise<void> {
    const html = baseTemplate(
      `<h2 style="margin: 0 0 16px; color: #0f172a;">Verify Your Email</h2>
       <p>Please verify your email address by clicking the button below.</p>`,
      'Verify Email',
      verificationUrl,
      this.appName,
    );
    await this.sendEmail(to, 'Verify Your Email Address', html);
  }
}
