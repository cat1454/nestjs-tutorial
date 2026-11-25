import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import * as fs from 'fs/promises';
import * as path from 'path';
import { MoreThanOrEqual, Repository } from 'typeorm';
import { ArticleEntity } from '../articles/entities/article.entity.js';
import {
  AttachmentTargetType,
  PUBLIC_AVATARS_SUBDIR,
} from '../attachments/attachments.constants.js';
import { AttachmentEntity } from '../attachments/entities/attachment.entity.js';
import { MailService } from '../mail/mail.service.js';
import { UserEntity } from '../users/entities/user.entity.js';
import {
  DAILY_DIGEST_CRON,
  DAILY_DIGEST_LOOKBACK_HOURS,
  DAILY_DIGEST_TOP_ARTICLES_LIMIT,
  ORPHAN_AVATARS_CLEANUP_CRON,
} from './tasks.constants.js';

export interface DailyDigestResult {
  skipped: boolean;
  articlesCount: number;
  emailsQueued: number;
}

export interface OrphanAvatarsCleanupResult {
  skipped: boolean;
  removedCount: number;
}

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(ArticleEntity)
    private readonly articleRepository: Repository<ArticleEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(AttachmentEntity)
    private readonly attachmentRepository: Repository<AttachmentEntity>,
    private readonly mailService: MailService,
  ) {}

  private get isSchedulerEnabled(): boolean {
    return this.configService.get<boolean>('scheduler.enabled', false);
  }

  @Cron(DAILY_DIGEST_CRON, { name: 'daily-articles-digest' })
  async handleDailyDigest(): Promise<DailyDigestResult> {
    if (!this.isSchedulerEnabled) {
      return { skipped: true, articlesCount: 0, emailsQueued: 0 };
    }

    const since = new Date(
      Date.now() - DAILY_DIGEST_LOOKBACK_HOURS * 60 * 60 * 1000,
    );

    const recentArticles = await this.articleRepository.find({
      where: { createdAt: MoreThanOrEqual(since) },
      relations: { author: true },
      order: { createdAt: 'DESC' },
      take: DAILY_DIGEST_TOP_ARTICLES_LIMIT,
    });

    if (recentArticles.length === 0) {
      this.logger.debug('Daily digest: no new articles in the last 24 hours');
      return { skipped: false, articlesCount: 0, emailsQueued: 0 };
    }

    const users = await this.userRepository.find({
      select: { id: true, email: true, username: true },
    });

    const summaries = recentArticles.map((article) => ({
      title: article.title,
      slug: article.slug,
      authorUsername: article.author?.username ?? 'unknown',
    }));

    let emailsQueued = 0;
    for (const user of users) {
      try {
        await this.mailService.sendDailyDigestEmail({
          recipientEmail: user.email,
          recipientUsername: user.username,
          articles: summaries,
        });
        emailsQueued += 1;
      } catch (error) {
        this.logger.warn(
          `Failed to enqueue daily digest email for user "${user.username}": ${(error as Error).message}`,
        );
      }
    }

    this.logger.log(
      `Daily digest queued ${emailsQueued} email(s) for ${recentArticles.length} recent article(s)`,
    );

    return {
      skipped: false,
      articlesCount: recentArticles.length,
      emailsQueued,
    };
  }

  @Cron(ORPHAN_AVATARS_CLEANUP_CRON, { name: 'cleanup-orphan-avatars' })
  async handleOrphanAvatarsCleanup(): Promise<OrphanAvatarsCleanupResult> {
    if (!this.isSchedulerEnabled) {
      return { skipped: true, removedCount: 0 };
    }

    const avatarsDir = path.join(process.cwd(), PUBLIC_AVATARS_SUBDIR);
    let diskFiles: string[];
    try {
      diskFiles = await fs.readdir(avatarsDir);
    } catch (error) {
      const fsError = error as NodeJS.ErrnoException;
      if (fsError.code === 'ENOENT') {
        return { skipped: false, removedCount: 0 };
      }
      throw error;
    }

    const userAttachments = await this.attachmentRepository.find({
      where: { targetType: AttachmentTargetType.USER },
      select: { url: true },
    });

    const activeFileNames = new Set(
      userAttachments.map((attachment) => path.basename(attachment.url)),
    );

    let removedCount = 0;
    for (const fileName of diskFiles) {
      if (fileName.startsWith('.') || activeFileNames.has(fileName)) {
        continue;
      }

      const filePath = path.join(avatarsDir, fileName);
      try {
        await fs.unlink(filePath);
        removedCount += 1;
      } catch (error) {
        this.logger.warn(
          `Failed to delete orphan avatar file "${fileName}": ${(error as Error).message}`,
        );
      }
    }

    if (removedCount > 0) {
      this.logger.log(`Cleaned up ${removedCount} orphan avatar file(s)`);
    }

    return { skipped: false, removedCount };
  }
}
