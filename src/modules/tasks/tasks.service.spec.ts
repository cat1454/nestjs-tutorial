import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as fs from 'fs/promises';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ArticleEntity } from '../articles/entities/article.entity.js';
import { AttachmentEntity } from '../attachments/entities/attachment.entity.js';
import { MailService } from '../mail/mail.service.js';
import { UserEntity } from '../users/entities/user.entity.js';
import { TasksService } from './tasks.service.js';

vi.mock('fs/promises', () => ({
  readdir: vi.fn(),
  unlink: vi.fn(),
}));

describe('TasksService', () => {
  let service: TasksService;
  let configService: { get: ReturnType<typeof vi.fn> };
  let articleRepo: { find: ReturnType<typeof vi.fn> };
  let userRepo: { find: ReturnType<typeof vi.fn> };
  let attachmentRepo: { find: ReturnType<typeof vi.fn> };
  let mailService: { sendDailyDigestEmail: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    vi.clearAllMocks();

    configService = {
      get: vi.fn().mockReturnValue(true),
    };
    articleRepo = { find: vi.fn() };
    userRepo = { find: vi.fn() };
    attachmentRepo = { find: vi.fn() };
    mailService = {
      sendDailyDigestEmail: vi.fn().mockResolvedValue(undefined),
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
      ],
    }).compile();

    service = module.get<TasksService>(TasksService);
  });

  describe('handleDailyDigest', () => {
    it('should skip when scheduler is disabled', async () => {
      configService.get.mockReturnValue(false);

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

    it('should queue daily digest emails for all users and tolerate partial queue failures', async () => {
      articleRepo.find.mockResolvedValue([
        {
          title: 'Daily Post',
          slug: 'daily-post-1',
          author: { username: 'author1' },
        },
      ]);
      userRepo.find.mockResolvedValue([
        { id: 'u1', email: 'u1@example.com', username: 'user1' },
        { id: 'u2', email: 'u2@example.com', username: 'user2' },
      ]);
      mailService.sendDailyDigestEmail
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Queue full'));

      const res = await service.handleDailyDigest();

      expect(res).toEqual({
        skipped: false,
        articlesCount: 1,
        emailsQueued: 1,
      });
      expect(mailService.sendDailyDigestEmail).toHaveBeenCalledTimes(2);
    });
  });

  describe('handleOrphanAvatarsCleanup', () => {
    it('should skip when scheduler is disabled', async () => {
      configService.get.mockReturnValue(false);

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

    it('should delete only unreferenced non-dotfile avatar files', async () => {
      vi.mocked(fs.readdir).mockResolvedValueOnce([
        '.gitkeep',
        'active.png',
        'orphan-1.png',
        'orphan-2.jpg',
      ] as any);
      attachmentRepo.find.mockResolvedValue([
        { url: '/public/uploads/avatars/active.png' },
      ]);
      vi.mocked(fs.unlink).mockResolvedValue(undefined);

      const res = await service.handleOrphanAvatarsCleanup();

      expect(res).toEqual({ skipped: false, removedCount: 2 });
      expect(fs.unlink).toHaveBeenCalledTimes(2);
    });
  });
});
