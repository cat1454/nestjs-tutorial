import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import * as fs from 'fs/promises';
import * as path from 'path';
import { MoreThanOrEqual, Repository } from 'typeorm';
import { RedisService } from '../../common/redis/redis.service.js';
import { ArticleEntity } from '../articles/entities/article.entity.js';
import {
  AttachmentTargetType,
  PUBLIC_AVATARS_SUBDIR,
} from '../attachments/attachments.constants.js';
import { AttachmentEntity } from '../attachments/entities/attachment.entity.js';
import { MailService } from '../mail/mail.service.js';
import { UserEntity } from '../users/entities/user.entity.js';
import { DEFAULT_LANGUAGE } from '../auth/auth.constants.js';
import {
  CRON_LOCK_TTL_SECONDS,
  DAILY_DIGEST_CRON,
  DAILY_DIGEST_LOCK_KEY_PREFIX,
  DAILY_DIGEST_LOOKBACK_HOURS,
  DAILY_DIGEST_TOP_ARTICLES_LIMIT,
  DAILY_DIGEST_USER_BATCH_SIZE,
  ORPHAN_AVATAR_GRACE_PERIOD_MS,
  ORPHAN_AVATARS_CLEANUP_CRON,
  ORPHAN_AVATARS_LOCK_KEY_PREFIX,
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
    private readonly redisService: RedisService,
  ) {}

  private get isSchedulerEnabled(): boolean {
    return this.configService.get<boolean>('scheduler.enabled', false);
  }

  private getUtcDateKey(): string {
    return new Date().toISOString().slice(0, 10);
  }

  @Cron(DAILY_DIGEST_CRON, { name: 'daily-articles-digest' })
  async handleDailyDigest(): Promise<DailyDigestResult> {
    if (!this.isSchedulerEnabled) {
      return { skipped: true, articlesCount: 0, emailsQueued: 0 };
    }

    const dateKey = this.getUtcDateKey();
    const lockKey = `${DAILY_DIGEST_LOCK_KEY_PREFIX}:${dateKey}`;
    const lockAcquired = await this.redisService.acquireLock(
      lockKey,
      CRON_LOCK_TTL_SECONDS,
    );
    if (!lockAcquired) {
      this.logger.debug(
        `Daily digest skipped: distributed lock "${lockKey}" already held by another replica`,
      );
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

    const summaries = recentArticles.map((article) => ({
      title: article.title,
      slug: article.slug,
      authorUsername: article.author?.username ?? 'unknown',
    }));

    const lang = this.configService.get<string>(
      'fallbackLanguage',
      DEFAULT_LANGUAGE,
    );

    let emailsQueued = 0;
    let offset = 0;

    while (true) {
      const usersBatch = await this.userRepository.find({
        select: { id: true, email: true, username: true },
        order: { id: 'ASC' },
        skip: offset,
        take: DAILY_DIGEST_USER_BATCH_SIZE,
      });

      if (usersBatch.length === 0) {
        break;
      }

      try {
        await this.mailService.sendDailyDigestEmailsBulk(
          usersBatch.map((user) => ({
            data: {
              recipientEmail: user.email,
              recipientUsername: user.username,
              articles: summaries,
              lang,
            },
            jobId: `daily-digest-${dateKey}-${user.id}`,
          })),
        );
        emailsQueued += usersBatch.length;
      } catch (error) {
        this.logger.warn(
          `Failed to enqueue daily digest batch (offset=${offset}, size=${usersBatch.length}): ${(error as Error).message}`,
        );
      }

      if (usersBatch.length < DAILY_DIGEST_USER_BATCH_SIZE) {
        break;
      }
      offset += DAILY_DIGEST_USER_BATCH_SIZE;
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

    const dateKey = this.getUtcDateKey();
    const lockKey = `${ORPHAN_AVATARS_LOCK_KEY_PREFIX}:${dateKey}`;
    const lockAcquired = await this.redisService.acquireLock(
      lockKey,
      CRON_LOCK_TTL_SECONDS,
    );
    if (!lockAcquired) {
      this.logger.debug(
        `Orphan avatars cleanup skipped: distributed lock "${lockKey}" already held by another replica`,
      );
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
    const now = Date.now();
    for (const fileName of diskFiles) {
      if (fileName.startsWith('.') || activeFileNames.has(fileName)) {
        continue;
      }

      const filePath = path.join(avatarsDir, fileName);
      try {
        const stats = await fs.stat(filePath);
        if (now - stats.mtimeMs < ORPHAN_AVATAR_GRACE_PERIOD_MS) {
          continue;
        }
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
