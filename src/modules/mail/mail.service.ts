import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  MAIL_JOB_DEFAULT_OPTIONS,
  MAIL_JOB_NAMES,
  MAIL_QUEUE_NAME,
} from './mail.constants.js';
import {
  DailyDigestBulkJobItem,
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

  async sendDailyDigestEmailsBulk(
    items: DailyDigestBulkJobItem[],
  ): Promise<void> {
    if (items.length === 0) {
      return;
    }

    await this.mailQueue.addBulk(
      items.map((item) => ({
        name: MAIL_JOB_NAMES.DAILY_DIGEST,
        data: item.data,
        opts: {
          ...MAIL_JOB_DEFAULT_OPTIONS,
          ...(item.jobId ? { jobId: item.jobId } : {}),
        },
      })),
    );
  }
}
