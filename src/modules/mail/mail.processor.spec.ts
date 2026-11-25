import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import nodemailer from 'nodemailer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MAIL_JOB_NAMES } from './mail.constants.js';
import { MailProcessor } from './mail.processor.js';
import { MailJobData } from './mail.types.js';

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(),
  },
}));

describe('MailProcessor', () => {
  const createConfigService = (overrides: Record<string, unknown> = {}) =>
    ({
      get: vi.fn((key: string, defaultValue?: unknown) => {
        if (key in overrides) {
          return overrides[key];
        }
        return defaultValue;
      }),
    }) as unknown as ConfigService;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should run in dry-run mode without creating transporter when mail.enabled is false', async () => {
    const processor = new MailProcessor(
      createConfigService({ 'mail.enabled': false }),
    );

    await processor.process({
      id: '1',
      name: MAIL_JOB_NAMES.WELCOME,
      data: { recipientEmail: 'a@b.com', username: 'alice' },
    } as Job<MailJobData>);

    expect(nodemailer.createTransport).not.toHaveBeenCalled();
  });

  it('should send welcome, new-comment, and daily-digest emails via SMTP when enabled and escape HTML', async () => {
    const sendMail = vi.fn().mockResolvedValue({ messageId: 'msg-1' });
    vi.mocked(nodemailer.createTransport).mockReturnValue({
      sendMail,
    } as any);

    const processor = new MailProcessor(
      createConfigService({
        'mail.enabled': true,
        'mail.host': 'localhost',
        'mail.port': 1025,
        'mail.secure': false,
        'mail.user': 'smtp-user',
        'mail.pass': 'smtp-pass',
        'mail.from': 'Conduit <no-reply@test.local>',
      }),
    );

    await processor.process({
      id: '2',
      name: MAIL_JOB_NAMES.NEW_COMMENT,
      data: {
        recipientEmail: 'author@example.com',
        recipientUsername: 'author',
        commenterUsername: '<b>bob</b>',
        articleTitle: 'A & B',
        articleSlug: 'a-b',
        commentBody: '<script>alert(1)</script>',
      },
    } as Job<MailJobData>);

    expect(sendMail).toHaveBeenCalledTimes(1);
    const callArg = sendMail.mock.calls[0][0];
    expect(callArg.from).toBe('Conduit <no-reply@test.local>');
    expect(callArg.to).toBe('author@example.com');
    expect(callArg.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(callArg.html).toContain('&lt;b&gt;bob&lt;/b&gt;');
    expect(callArg.html).toContain('A &amp; B');

    await processor.process({
      id: '3',
      name: MAIL_JOB_NAMES.DAILY_DIGEST,
      data: {
        recipientEmail: 'reader@example.com',
        recipientUsername: 'reader',
        articles: [
          { title: 'Post 1', slug: 'post-1', authorUsername: 'author' },
        ],
      },
    } as Job<MailJobData>);

    expect(sendMail).toHaveBeenCalledTimes(2);
    expect(sendMail.mock.calls[1][0].subject).toContain('1 new articles');
  });

  it('should safely ignore unknown job names', async () => {
    const sendMail = vi.fn();
    vi.mocked(nodemailer.createTransport).mockReturnValue({
      sendMail,
    } as any);

    const processor = new MailProcessor(
      createConfigService({ 'mail.enabled': true }),
    );

    await processor.process({
      id: '99',
      name: 'unknown-job',
      data: {} as any,
    } as Job<MailJobData>);

    expect(sendMail).not.toHaveBeenCalled();
  });
});
