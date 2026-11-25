import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  MAIL_JOB_DEFAULT_OPTIONS,
  MAIL_JOB_NAMES,
  MAIL_QUEUE_NAME,
} from './mail.constants.js';
import {
  DailyDigestEmailJobData,
  NewCommentEmailJobData,
  WelcomeEmailJobData,
} from './mail.types.js';

@Injectable()
export class MailService {
  constructor(
    @InjectQueue(MAIL_QUEUE_NAME)
    private readonly mailQueue: Queue,
  ) {}

  async sendWelcomeEmail(data: WelcomeEmailJobData): Promise<void> {
    await this.mailQueue.add(
      MAIL_JOB_NAMES.WELCOME,
      data,
      MAIL_JOB_DEFAULT_OPTIONS,
    );
  }

  async sendNewCommentNotification(
    data: NewCommentEmailJobData,
  ): Promise<void> {
    await this.mailQueue.add(
      MAIL_JOB_NAMES.NEW_COMMENT,
      data,
      MAIL_JOB_DEFAULT_OPTIONS,
    );
  }

  async sendDailyDigestEmail(
    data: DailyDigestEmailJobData,
    jobId?: string,
  ): Promise<void> {
    await this.mailQueue.add(MAIL_JOB_NAMES.DAILY_DIGEST, data, {
      ...MAIL_JOB_DEFAULT_OPTIONS,
      ...(jobId ? { jobId } : {}),
    });
  }
}
