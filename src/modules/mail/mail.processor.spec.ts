import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { I18nService } from 'nestjs-i18n';
import nodemailer from 'nodemailer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import enMail from '../../i18n/en/mail.json';
import viMail from '../../i18n/vi/mail.json';
import { MAIL_JOB_NAMES } from './mail.constants.js';
import { MailProcessor } from './mail.processor.js';
import { MailJobData } from './mail.types.js';

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(),
  },
}));

const translations: Record<string, Record<string, any>> = {
  en: { mail: enMail },
  vi: { mail: viMail },
};

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

  const createI18nService = () =>
    ({
      t: vi.fn(
        async (
          key: string,
          options?: { lang?: string; args?: Record<string, unknown> },
        ) => {
          const lang = options?.lang ?? 'en';
          const parts = key.split('.');
          let value: any = translations[lang] ?? translations.en;
          for (const part of parts) {
            value = value?.[part];
          }
          if (typeof value !== 'string') {
            return key;
          }
          return value.replace(/\{(\w+)\}/g, (_, k) =>
            String(options?.args?.[k] ?? ''),
          );
        },
      ),
    }) as unknown as I18nService;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should run in dry-run mode without creating transporter when mail.enabled is false', async () => {
    const processor = new MailProcessor(
      createConfigService({ 'mail.enabled': false }),
      createI18nService(),
    );

    await processor.process({
      id: '1',
      name: MAIL_JOB_NAMES.WELCOME,
      data: { recipientEmail: 'a@b.com', username: 'alice', lang: 'en' },
    } as Job<MailJobData>);

    expect(nodemailer.createTransport).not.toHaveBeenCalled();
  });

  it('should render Handlebars templates with i18n (en & vi) and escape HTML via SMTP when enabled', async () => {
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
      createI18nService(),
    );

    await processor.process({
      id: '1',
      name: MAIL_JOB_NAMES.WELCOME,
      data: {
        recipientEmail: 'alice@example.com',
        username: 'alice',
        lang: 'vi',
      },
    } as Job<MailJobData>);

    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0][0].subject).toBe(
      'Chào mừng đến với Sun* Conduit!',
    );
    expect(sendMail.mock.calls[0][0].html).toContain('<h1>Chào mừng, alice!</h1>');

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
        lang: 'en',
      },
    } as Job<MailJobData>);

    expect(sendMail).toHaveBeenCalledTimes(2);
    const commentCall = sendMail.mock.calls[1][0];
    expect(commentCall.from).toBe('Conduit <no-reply@test.local>');
    expect(commentCall.to).toBe('author@example.com');
    expect(commentCall.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(commentCall.html).toContain('&lt;b&gt;bob&lt;/b&gt;');
    expect(commentCall.html).toContain('A &amp; B');

    await processor.process({
      id: '3',
      name: MAIL_JOB_NAMES.DAILY_DIGEST,
      data: {
        recipientEmail: 'reader@example.com',
        recipientUsername: 'reader',
        articles: [
          { title: 'Post 1', slug: 'post-1', authorUsername: 'author' },
        ],
        lang: 'vi',
      },
    } as Job<MailJobData>);

    expect(sendMail).toHaveBeenCalledTimes(3);
    expect(sendMail.mock.calls[2][0].subject).toContain('1 bài viết mới');
    expect(sendMail.mock.calls[2][0].html).toContain(
      '<strong>Post 1</strong> bởi author',
    );
  });

  it('should safely ignore unknown job names', async () => {
    const sendMail = vi.fn();
    vi.mocked(nodemailer.createTransport).mockReturnValue({
      sendMail,
    } as any);

    const processor = new MailProcessor(
      createConfigService({ 'mail.enabled': true }),
      createI18nService(),
    );

    await processor.process({
      id: '99',
      name: 'unknown-job',
      data: {} as any,
    } as Job<MailJobData>);

    expect(sendMail).not.toHaveBeenCalled();

    processor.onCompleted({ id: '1', name: MAIL_JOB_NAMES.WELCOME } as Job);
    processor.onCompleted({ name: MAIL_JOB_NAMES.WELCOME } as Job);
    processor.onFailed(
      { id: '2', name: MAIL_JOB_NAMES.NEW_COMMENT } as Job,
      new Error('SMTP timeout'),
    );
    processor.onFailed(undefined, new Error('Worker error'));
  });
});
