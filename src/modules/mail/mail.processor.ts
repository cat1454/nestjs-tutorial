import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import * as fs from 'fs/promises';
import Handlebars from 'handlebars';
import { I18nService } from 'nestjs-i18n';
import nodemailer, { Transporter } from 'nodemailer';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { DEFAULT_LANGUAGE } from '../auth/auth.constants.js';
import { MAIL_JOB_NAMES, MAIL_QUEUE_NAME } from './mail.constants.js';
import {
  DailyDigestEmailJobData,
  EmailMessage,
  MailJobData,
  NewCommentEmailJobData,
  WelcomeEmailJobData,
} from './mail.types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMPLATES_DIR = path.join(__dirname, 'templates');

@Injectable()
@Processor(MAIL_QUEUE_NAME)
export class MailProcessor extends WorkerHost {
  private readonly logger = new Logger(MailProcessor.name);
  private readonly mailEnabled: boolean;
  private readonly mailFrom: string;
  private readonly fallbackLanguage: string;
  private readonly transporter: Transporter | null;
  private readonly templateCache = new Map<
    string,
    Handlebars.TemplateDelegate
  >();

  constructor(
    private readonly configService: ConfigService,
    private readonly i18n: I18nService,
  ) {
    super();

    this.mailEnabled = this.configService.get<boolean>('mail.enabled', false);
    this.mailFrom = this.configService.get<string>(
      'mail.from',
      'Sun* Conduit <no-reply@sun-conduit.local>',
    );
    this.fallbackLanguage = this.configService.get<string>(
      'fallbackLanguage',
      DEFAULT_LANGUAGE,
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
    const emailMessage = await this.buildEmailMessage(job);
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

  private async renderTemplate(
    templateName: string,
    context: Record<string, unknown>,
  ): Promise<string> {
    let compiled = this.templateCache.get(templateName);
    if (!compiled) {
      const templatePath = path.join(TEMPLATES_DIR, `${templateName}.hbs`);
      const source = await fs.readFile(templatePath, 'utf-8');
      compiled = Handlebars.compile(source);
      this.templateCache.set(templateName, compiled);
    }
    return compiled(context);
  }

  private async buildEmailMessage(
    job: Job<MailJobData>,
  ): Promise<EmailMessage | null> {
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

  private async translate(
    key: string,
    lang: string,
    args?: Record<string, unknown>,
  ): Promise<string> {
    const result = await this.i18n.t(key, { lang, args });
    return String(result);
  }

  private async buildWelcomeEmail(
    data: WelcomeEmailJobData,
  ): Promise<EmailMessage> {
    const lang = data.lang || this.fallbackLanguage;
    const [subject, heading, body] = await Promise.all([
      this.translate('mail.welcome.subject', lang),
      this.translate('mail.welcome.heading', lang, {
        username: data.username,
      }),
      this.translate('mail.welcome.body', lang),
    ]);

    const html = await this.renderTemplate('welcome', { heading, body });

    return {
      to: data.recipientEmail,
      subject,
      text: `${heading}\n\n${body}`,
      html,
    };
  }

  private async buildNewCommentEmail(
    data: NewCommentEmailJobData,
  ): Promise<EmailMessage> {
    const lang = data.lang || this.fallbackLanguage;
    const [subject, greeting, intro] = await Promise.all([
      this.translate('mail.new_comment.subject', lang, {
        articleTitle: data.articleTitle,
      }),
      this.translate('mail.new_comment.greeting', lang, {
        recipientUsername: data.recipientUsername,
      }),
      this.translate('mail.new_comment.intro', lang, {
        commenterUsername: data.commenterUsername,
        articleTitle: data.articleTitle,
      }),
    ]);

    const html = await this.renderTemplate('new-comment', {
      greeting,
      intro,
      commentBody: data.commentBody,
    });

    return {
      to: data.recipientEmail,
      subject,
      text: `${greeting}\n\n${intro}\n\n"${data.commentBody}" (${data.articleSlug})`,
      html,
    };
  }

  private async buildDailyDigestEmail(
    data: DailyDigestEmailJobData,
  ): Promise<EmailMessage> {
    const lang = data.lang || this.fallbackLanguage;
    const [subject, greeting, intro, byAuthor] = await Promise.all([
      this.translate('mail.daily_digest.subject', lang, {
        count: data.articles.length,
      }),
      this.translate('mail.daily_digest.greeting', lang, {
        recipientUsername: data.recipientUsername,
      }),
      this.translate('mail.daily_digest.intro', lang),
      this.translate('mail.daily_digest.by_author', lang),
    ]);

    const textList = data.articles
      .map(
        (article, index) =>
          `${index + 1}. ${article.title} ${byAuthor} ${article.authorUsername} (${article.slug})`,
      )
      .join('\n');

    const html = await this.renderTemplate('daily-digest', {
      greeting,
      intro,
      byAuthor,
      articles: data.articles,
    });

    return {
      to: data.recipientEmail,
      subject,
      text: `${greeting}\n\n${intro}\n${textList}`,
      html,
    };
  }
}
