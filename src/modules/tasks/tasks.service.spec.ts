import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as fs from 'fs/promises';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RedisService } from '../../common/redis/redis.service.js';
import { ArticleEntity } from '../articles/entities/article.entity.js';
import { AttachmentEntity } from '../attachments/entities/attachment.entity.js';
import { MailService } from '../mail/mail.service.js';
import { UserEntity } from '../users/entities/user.entity.js';
import {
  DAILY_DIGEST_USER_BATCH_SIZE,
  ORPHAN_AVATAR_GRACE_PERIOD_MS,
} from './tasks.constants.js';
import { TasksService } from './tasks.service.js';

vi.mock('fs/promises', () => ({
  readdir: vi.fn(),
  stat: vi.fn(),
  unlink: vi.fn(),
}));

describe('TasksService', () => {
  let service: TasksService;
  let configService: { get: ReturnType<typeof vi.fn> };
  let articleRepo: { find: ReturnType<typeof vi.fn> };
  let userRepo: { find: ReturnType<typeof vi.fn> };
  let attachmentRepo: { find: ReturnType<typeof vi.fn> };
  let mailService: { sendDailyDigestEmailsBulk: ReturnType<typeof vi.fn> };
  let redisService: { acquireLock: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    vi.clearAllMocks();

    configService = {
      get: vi.fn((key: string, defaultValue?: unknown) => {
        if (key === 'scheduler.enabled') return true;
        if (key === 'fallbackLanguage') return 'en';
        return defaultValue;
      }),
    };
    articleRepo = { find: vi.fn() };
    userRepo = { find: vi.fn() };
    attachmentRepo = { find: vi.fn() };
    mailService = {
      sendDailyDigestEmailsBulk: vi.fn().mockResolvedValue(undefined),
    };
    redisService = {
      acquireLock: vi.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: ConfigService, useValue: configService },
        { provide: getRepositoryToken(ArticleEntity), useValue: articleRepo },
        { provide: getRepositoryToken(UserEntity), useValue: userRepo },
        {
          provide: getRepositoryToken(AttachmentEntity),
          useValue: attachmentRepo,
        },
        { provide: MailService, useValue: mailService },
        { provide: RedisService, useValue: redisService },
      ],
    }).compile();

    service = module.get<TasksService>(TasksService);
  });

  describe('handleDailyDigest', () => {
    it('should skip when scheduler is disabled', async () => {
      configService.get.mockReturnValue(false);

      const res = await service.handleDailyDigest();

      expect(res).toEqual({ skipped: true, articlesCount: 0, emailsQueued: 0 });
      expect(redisService.acquireLock).not.toHaveBeenCalled();
      expect(articleRepo.find).not.toHaveBeenCalled();
    });

    it('should skip when distributed lock is already held by another replica', async () => {
      redisService.acquireLock.mockResolvedValueOnce(false);

      const res = await service.handleDailyDigest();

      expect(res).toEqual({ skipped: true, articlesCount: 0, emailsQueued: 0 });
      expect(articleRepo.find).not.toHaveBeenCalled();
    });

    it('should return 0 emails queued when no recent articles exist', async () => {
      articleRepo.find.mockResolvedValue([]);

      const res = await service.handleDailyDigest();

      expect(res).toEqual({
        skipped: false,
        articlesCount: 0,
        emailsQueued: 0,
      });
      expect(userRepo.find).not.toHaveBeenCalled();
    });

    it('should read users in batches and enqueue via addBulk with deterministic jobId', async () => {
      articleRepo.find.mockResolvedValue([
        {
          title: 'Daily Post',
          slug: 'daily-post-1',
          author: { username: 'author1' },
        },
      ]);

      const firstBatch = Array.from(
        { length: DAILY_DIGEST_USER_BATCH_SIZE },
        (_, i) => ({
          id: `u-${i}`,
          email: `u${i}@example.com`,
          username: `user${i}`,
        }),
      );
      const secondBatch = [
        { id: 'u-last', email: 'last@example.com', username: 'lastuser' },
      ];

      userRepo.find
        .mockResolvedValueOnce(firstBatch)
        .mockResolvedValueOnce(secondBatch);

      const res = await service.handleDailyDigest();

      expect(res).toEqual({
        skipped: false,
        articlesCount: 1,
        emailsQueued: DAILY_DIGEST_USER_BATCH_SIZE + 1,
      });
      expect(userRepo.find).toHaveBeenNthCalledWith(1, {
        select: { id: true, email: true, username: true },
        order: { id: 'ASC' },
        skip: 0,
        take: DAILY_DIGEST_USER_BATCH_SIZE,
      });
      expect(userRepo.find).toHaveBeenNthCalledWith(2, {
        select: { id: true, email: true, username: true },
        order: { id: 'ASC' },
        skip: DAILY_DIGEST_USER_BATCH_SIZE,
        take: DAILY_DIGEST_USER_BATCH_SIZE,
      });
      expect(mailService.sendDailyDigestEmailsBulk).toHaveBeenCalledTimes(2);
      expect(
        mailService.sendDailyDigestEmailsBulk.mock.calls[1][0],
      ).toEqual([
        {
          data: {
            recipientEmail: 'last@example.com',
            recipientUsername: 'lastuser',
            articles: [
              {
                title: 'Daily Post',
                slug: 'daily-post-1',
                authorUsername: 'author1',
              },
            ],
            lang: 'en',
          },
          jobId: expect.stringMatching(/^daily-digest-\d{4}-\d{2}-\d{2}-u-last$/),
        },
      ]);
    });

    it('should tolerate batch enqueue failures and continue remaining batches', async () => {
      articleRepo.find.mockResolvedValue([
        {
          title: 'Daily Post',
          slug: 'daily-post-1',
          author: { username: 'author1' },
        },
      ]);

      const firstBatch = Array.from(
        { length: DAILY_DIGEST_USER_BATCH_SIZE },
        (_, i) => ({
          id: `u-${i}`,
          email: `u${i}@example.com`,
          username: `user${i}`,
        }),
      );
      const secondBatch = [
        { id: 'u-ok', email: 'ok@example.com', username: 'okuser' },
      ];

      userRepo.find
        .mockResolvedValueOnce(firstBatch)
        .mockResolvedValueOnce(secondBatch);
      mailService.sendDailyDigestEmailsBulk
        .mockRejectedValueOnce(new Error('Redis timeout'))
        .mockResolvedValueOnce(undefined);

      const res = await service.handleDailyDigest();

      expect(res).toEqual({
        skipped: false,
        articlesCount: 1,
        emailsQueued: 1,
      });
    });
  });

  describe('handleOrphanAvatarsCleanup', () => {
    it('should skip when scheduler is disabled', async () => {
      configService.get.mockReturnValue(false);

      const res = await service.handleOrphanAvatarsCleanup();

      expect(res).toEqual({ skipped: true, removedCount: 0 });
      expect(redisService.acquireLock).not.toHaveBeenCalled();
      expect(fs.readdir).not.toHaveBeenCalled();
    });

    it('should skip when distributed lock is already held by another replica', async () => {
      redisService.acquireLock.mockResolvedValueOnce(false);

      const res = await service.handleOrphanAvatarsCleanup();

      expect(res).toEqual({ skipped: true, removedCount: 0 });
      expect(fs.readdir).not.toHaveBeenCalled();
    });

    it('should return 0 removed when avatars directory does not exist', async () => {
      const enoent = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      vi.mocked(fs.readdir).mockRejectedValueOnce(enoent);

      const res = await service.handleOrphanAvatarsCleanup();

      expect(res).toEqual({ skipped: false, removedCount: 0 });
    });

    it('should delete only stale unreferenced non-dotfile avatar files and preserve recently modified files', async () => {
      const now = Date.now();
      const staleMtime = now - ORPHAN_AVATAR_GRACE_PERIOD_MS - 60_000;
      const recentMtime = now - 5 * 60_000;

      vi.mocked(fs.readdir).mockResolvedValueOnce([
        '.gitkeep',
        'active.png',
        'recent-upload.png',
        'stale-orphan-1.png',
        'stale-orphan-2.jpg',
      ] as any);
      attachmentRepo.find.mockResolvedValue([
        { url: '/public/uploads/avatars/active.png' },
      ]);
      vi.mocked(fs.stat).mockImplementation(async (filePath: any) => {
        if (String(filePath).includes('recent-upload.png')) {
          return { mtimeMs: recentMtime } as any;
        }
        return { mtimeMs: staleMtime } as any;
      });
      vi.mocked(fs.unlink).mockResolvedValue(undefined);

      const res = await service.handleOrphanAvatarsCleanup();

      expect(res).toEqual({ skipped: false, removedCount: 2 });
      expect(fs.unlink).toHaveBeenCalledTimes(2);
      expect(fs.unlink).not.toHaveBeenCalledWith(
        expect.stringContaining('recent-upload.png'),
      );
      expect(fs.unlink).not.toHaveBeenCalledWith(
        expect.stringContaining('active.png'),
      );
    });

    it('should rethrow non-ENOENT readdir errors and continue when unlink fails', async () => {
      const eacces = Object.assign(new Error('Permission denied'), {
        code: 'EACCES',
      });
      vi.mocked(fs.readdir).mockRejectedValueOnce(eacces);
      await expect(service.handleOrphanAvatarsCleanup()).rejects.toThrow(
        'Permission denied',
      );

      vi.mocked(fs.readdir).mockResolvedValueOnce(['stale.png'] as any);
      attachmentRepo.find.mockResolvedValue([]);
      vi.mocked(fs.stat).mockResolvedValueOnce({
        mtimeMs: Date.now() - ORPHAN_AVATAR_GRACE_PERIOD_MS - 10_000,
      } as any);
      vi.mocked(fs.unlink).mockRejectedValueOnce(new Error('EBUSY'));

      const res = await service.handleOrphanAvatarsCleanup();
      expect(res).toEqual({ skipped: false, removedCount: 0 });
    });
  });
});
