import { getQueueToken } from '@nestjs/bullmq';
import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAIL_JOB_DEFAULT_OPTIONS,
  MAIL_JOB_NAMES,
  MAIL_QUEUE_NAME,
} from './mail.constants.js';
import { MailService } from './mail.service.js';

describe('MailService', () => {
  let service: MailService;
  let mailQueue: {
    add: ReturnType<typeof vi.fn>;
    addBulk: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    mailQueue = {
      add: vi.fn().mockResolvedValue({ id: 'job-1' }),
      addBulk: vi.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailService,
        { provide: getQueueToken(MAIL_QUEUE_NAME), useValue: mailQueue },
      ],
    }).compile();

    service = module.get<MailService>(MailService);
  });

  it('should enqueue welcome email job with retry options', async () => {
    const payload = {
      recipientEmail: 'alice@example.com',
      username: 'alice',
    };

    await service.sendWelcomeEmail(payload);

    expect(mailQueue.add).toHaveBeenCalledWith(
      MAIL_JOB_NAMES.WELCOME,
      payload,
      MAIL_JOB_DEFAULT_OPTIONS,
    );
  });

  it('should enqueue new comment notification job with retry options', async () => {
    const payload = {
      recipientEmail: 'author@example.com',
      recipientUsername: 'author',
      commenterUsername: 'bob',
      articleTitle: 'NestJS Guide',
      articleSlug: 'nestjs-guide-1234',
      commentBody: 'Awesome!',
    };

    await service.sendNewCommentNotification(payload);

    expect(mailQueue.add).toHaveBeenCalledWith(
      MAIL_JOB_NAMES.NEW_COMMENT,
      payload,
      MAIL_JOB_DEFAULT_OPTIONS,
    );
  });

  it('should enqueue daily digest email job with retry options and deduplication jobId', async () => {
    const payload = {
      recipientEmail: 'alice@example.com',
      recipientUsername: 'alice',
      articles: [
        {
          title: 'Article 1',
          slug: 'article-1',
          authorUsername: 'bob',
        },
      ],
    };

    await service.sendDailyDigestEmail(payload, 'daily-digest-2026-11-25-u1');

    expect(mailQueue.add).toHaveBeenCalledWith(
      MAIL_JOB_NAMES.DAILY_DIGEST,
      payload,
      {
        ...MAIL_JOB_DEFAULT_OPTIONS,
        jobId: 'daily-digest-2026-11-25-u1',
      },
    );
  });

  it('should enqueue daily digest emails in bulk via addBulk and skip empty batches', async () => {
    await service.sendDailyDigestEmailsBulk([]);
    expect(mailQueue.addBulk).not.toHaveBeenCalled();

    const items = [
      {
        data: {
          recipientEmail: 'alice@example.com',
          recipientUsername: 'alice',
          articles: [
            { title: 'Article 1', slug: 'article-1', authorUsername: 'bob' },
          ],
          lang: 'en',
        },
        jobId: 'daily-digest-2026-11-25-u1',
      },
      {
        data: {
          recipientEmail: 'charlie@example.com',
          recipientUsername: 'charlie',
          articles: [
            { title: 'Article 1', slug: 'article-1', authorUsername: 'bob' },
          ],
          lang: 'vi',
        },
        jobId: 'daily-digest-2026-11-25-u2',
      },
    ];

    await service.sendDailyDigestEmailsBulk(items);

    expect(mailQueue.addBulk).toHaveBeenCalledWith([
      {
        name: MAIL_JOB_NAMES.DAILY_DIGEST,
        data: items[0].data,
        opts: {
          ...MAIL_JOB_DEFAULT_OPTIONS,
          jobId: 'daily-digest-2026-11-25-u1',
        },
      },
      {
        name: MAIL_JOB_NAMES.DAILY_DIGEST,
        data: items[1].data,
        opts: {
          ...MAIL_JOB_DEFAULT_OPTIONS,
          jobId: 'daily-digest-2026-11-25-u2',
        },
      },
    ]);
  });
});
