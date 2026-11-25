import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import nodemailer, { Transporter } from 'nodemailer';
import { MAIL_JOB_NAMES, MAIL_QUEUE_NAME } from './mail.constants.js';
import {
  DailyDigestEmailJobData,
  EmailMessage,
  MailJobData,
  NewCommentEmailJobData,
  WelcomeEmailJobData,
} from './mail.types.js';

@Injectable()
@Processor(MAIL_QUEUE_NAME)
export class MailProcessor extends WorkerHost {
  private readonly logger = new Logger(MailProcessor.name);
  private readonly mailEnabled: boolean;
  private readonly mailFrom: string;
  private readonly transporter: Transporter | null;

  constructor(private readonly configService: ConfigService) {
    super();

    this.mailEnabled = this.configService.get<boolean>('mail.enabled', false);
    this.mailFrom = this.configService.get<string>(
      'mail.from',
      'Sun* Conduit <no-reply@sun-conduit.local>',
    );

    if (this.mailEnabled) {
      const user = this.configService.get<string>('mail.user', '');
      const pass = this.configService.get<string>('mail.pass', '');

      this.transporter = nodemailer.createTransport({
        host: this.configService.get<string>('mail.host', 'localhost'),
        port: this.configService.get<number>('mail.port', 1025),
        secure: this.configService.get<boolean>('mail.secure', false),
        ...(user && pass ? { auth: { user, pass } } : {}),
      });
    } else {
      this.transporter = null;
    }
  }

  async process(job: Job<MailJobData>): Promise<void> {
    const emailMessage = this.buildEmailMessage(job);
    if (!emailMessage) {
      this.logger.warn(`Unknown mail job name: ${job.name}`);
      return;
    }

    if (!this.mailEnabled || !this.transporter) {
      this.logger.log(
        `[Mail Dry-Run] Job #${job.id ?? 'n/a'} (${job.name}) -> to=${emailMessage.to}, subject="${emailMessage.subject}"`,
      );
      return;
    }

    await this.transporter.sendMail({
      from: this.mailFrom,
      to: emailMessage.to,
      subject: emailMessage.subject,
      text: emailMessage.text,
      html: emailMessage.html,
    });
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job): void {
    this.logger.debug(
      `Mail job #${job.id ?? 'n/a'} (${job.name}) completed successfully`,
    );
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job | undefined, error: Error): void {
    this.logger.error(
      `Mail job #${job?.id ?? 'n/a'} (${job?.name ?? 'unknown'}) failed: ${error.message}`,
    );
  }

  private buildEmailMessage(job: Job<MailJobData>): EmailMessage | null {
    switch (job.name) {
      case MAIL_JOB_NAMES.WELCOME:
        return this.buildWelcomeEmail(job.data as WelcomeEmailJobData);
      case MAIL_JOB_NAMES.NEW_COMMENT:
        return this.buildNewCommentEmail(job.data as NewCommentEmailJobData);
      case MAIL_JOB_NAMES.DAILY_DIGEST:
        return this.buildDailyDigestEmail(job.data as DailyDigestEmailJobData);
      default:
        return null;
    }
  }

  private buildWelcomeEmail(data: WelcomeEmailJobData): EmailMessage {
    const safeUsername = this.escapeHtml(data.username);
    return {
      to: data.recipientEmail,
      subject: 'Welcome to Sun* Conduit!',
      text: `Hi ${data.username}, welcome to Sun* Conduit! Your account has been created successfully.`,
      html: `<h1>Welcome, ${safeUsername}!</h1><p>Your Sun* Conduit account has been created successfully.</p>`,
    };
  }

  private buildNewCommentEmail(data: NewCommentEmailJobData): EmailMessage {
    const safeRecipient = this.escapeHtml(data.recipientUsername);
    const safeCommenter = this.escapeHtml(data.commenterUsername);
    const safeTitle = this.escapeHtml(data.articleTitle);
    const safeBody = this.escapeHtml(data.commentBody);

    return {
      to: data.recipientEmail,
      subject: `New comment on "${data.articleTitle}"`,
      text: `Hi ${data.recipientUsername},\n\n${data.commenterUsername} commented on your article "${data.articleTitle}" (${data.articleSlug}):\n\n"${data.commentBody}"`,
      html: `<p>Hi ${safeRecipient},</p><p><strong>${safeCommenter}</strong> commented on your article <strong>${safeTitle}</strong>:</p><blockquote>${safeBody}</blockquote>`,
    };
  }

  private buildDailyDigestEmail(data: DailyDigestEmailJobData): EmailMessage {
    const safeRecipient = this.escapeHtml(data.recipientUsername);
    const textList = data.articles
      .map(
        (article, index) =>
          `${index + 1}. ${article.title} by ${article.authorUsername} (${article.slug})`,
      )
      .join('\n');
    const htmlList = data.articles
      .map(
        (article) =>
          `<li><strong>${this.escapeHtml(article.title)}</strong> by ${this.escapeHtml(article.authorUsername)}</li>`,
      )
      .join('');

    return {
      to: data.recipientEmail,
      subject: `Sun* Conduit Daily Digest (${data.articles.length} new articles)`,
      text: `Hi ${data.recipientUsername},\n\nHere are the latest articles from the past 24 hours:\n${textList}`,
      html: `<p>Hi ${safeRecipient},</p><p>Here are the latest articles from the past 24 hours:</p><ul>${htmlList}</ul>`,
    };
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
