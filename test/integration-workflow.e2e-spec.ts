import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { RedisService } from '../src/common/redis/redis.service.js';
import { MailService } from '../src/modules/mail/mail.service.js';
import { DAILY_DIGEST_LOCK_KEY_PREFIX } from '../src/modules/tasks/tasks.constants.js';
import { TasksService } from '../src/modules/tasks/tasks.service.js';
import { createTestApp } from './helpers/create-test-app.js';
import { truncateDatabase } from './helpers/database.helper.js';
import {
  buildCommentPayload,
  createArticle,
  createComment,
  registerUser,
} from './helpers/factories.js';

describe('End-to-End Integration Workflow (Truncate DB + Faker + Cross-Module)', () => {
  let app: NestExpressApplication;
  let dataSource: DataSource;
  let tasksService: TasksService;
  let mailService: MailService;
  let configService: ConfigService;
  let redisService: RedisService;

  beforeAll(async () => {
    ({ app, dataSource } = await createTestApp());
    tasksService = app.get(TasksService);
    mailService = app.get(MailService);
    configService = app.get(ConfigService);
    redisService = app.get(RedisService);
  });

  beforeEach(async () => {
    await truncateDatabase(dataSource);
  });

  afterAll(async () => {
    await truncateDatabase(dataSource);
    await app.close();
  });

  it('completes full user journey: Register -> Follow -> Article -> Feed -> Favorite -> Comment -> Password Revocation -> Logout', async () => {
    // 1. Register author and reader with Faker factories
    const author = await registerUser(app);
    const reader = await registerUser(app);

    // 2. Reader follows Author
    const followRes = await request(app.getHttpServer())
      .post(`/api/v1/profiles/${author.credentials.username}/follow`)
      .set('Authorization', `Bearer ${reader.token}`)
      .expect(200);
    expect(followRes.body.data.profile.following).toBe(true);

    // 3. Author creates an article with Faker payload
    const createdArticle = await createArticle(app, author.token, {
      tagList: ['integration', 'nestjs'],
    });
    expect(createdArticle.slug).toBeDefined();

    // 4. Reader sees Author's article in personal feed
    const feedRes = await request(app.getHttpServer())
      .get('/api/v1/articles/feed')
      .set('Authorization', `Bearer ${reader.token}`)
      .expect(200);
    expect(feedRes.body.data.articlesCount).toBe(1);
    expect(feedRes.body.data.articles[0].slug).toBe(createdArticle.slug);
    expect(feedRes.body.data.articles[0].author.following).toBe(true);

    // 5. Reader favorites the article
    const favRes = await request(app.getHttpServer())
      .post(`/api/v1/articles/${createdArticle.slug}/favorite`)
      .set('Authorization', `Bearer ${reader.token}`)
      .expect(200);
    expect(favRes.body.data.article.favorited).toBe(true);
    expect(favRes.body.data.article.favoritesCount).toBe(1);

    // 6. Reader posts a comment on the article
    const comment = await createComment(
      app,
      reader.token,
      createdArticle.slug,
      buildCommentPayload(),
    );
    expect(comment.author.username).toBe(reader.credentials.username);

    // 7. Author fetches comments and sees reader's comment
    const commentsRes = await request(app.getHttpServer())
      .get(`/api/v1/articles/${createdArticle.slug}/comments`)
      .set('Authorization', `Bearer ${author.token}`)
      .expect(200);
    expect(commentsRes.body.data.comments).toHaveLength(1);
    expect(commentsRes.body.data.comments[0].id).toBe(comment.id);

    // 8. Reader deletes comment, unfavorites article, and unfollows author
    await request(app.getHttpServer())
      .delete(`/api/v1/articles/${createdArticle.slug}/comments/${comment.id}`)
      .set('Authorization', `Bearer ${reader.token}`)
      .expect(200);

    const unfavRes = await request(app.getHttpServer())
      .delete(`/api/v1/articles/${createdArticle.slug}/favorite`)
      .set('Authorization', `Bearer ${reader.token}`)
      .expect(200);
    expect(unfavRes.body.data.article.favorited).toBe(false);
    expect(unfavRes.body.data.article.favoritesCount).toBe(0);

    const unfollowRes = await request(app.getHttpServer())
      .delete(`/api/v1/profiles/${author.credentials.username}/follow`)
      .set('Authorization', `Bearer ${reader.token}`)
      .expect(200);
    expect(unfollowRes.body.data.profile.following).toBe(false);

    // 9. Author changes password -> old token is revoked, new token works
    const oldAuthorToken = author.token;
    const updatePwRes = await request(app.getHttpServer())
      .put('/api/v1/user')
      .set('Authorization', `Bearer ${oldAuthorToken}`)
      .send({ user: { password: 'NewPassword@456' } })
      .expect(200);
    const newAuthorToken = updatePwRes.body.data.user.token as string;
    expect(newAuthorToken).not.toBe(oldAuthorToken);

    await request(app.getHttpServer())
      .get('/api/v1/user')
      .set('Authorization', `Bearer ${oldAuthorToken}`)
      .expect(401);

    await request(app.getHttpServer())
      .get('/api/v1/user')
      .set('Authorization', `Bearer ${newAuthorToken}`)
      .expect(200);

    // 10. Logout blacklists new token
    await request(app.getHttpServer())
      .post('/api/v1/users/logout')
      .set('Authorization', `Bearer ${newAuthorToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get('/api/v1/user')
      .set('Authorization', `Bearer ${newAuthorToken}`)
      .expect(401);
  });

  it('runs TasksService.handleDailyDigest once across replicas using real PostgreSQL + Redis distributed lock', async () => {
    const author = await registerUser(app);
    await registerUser(app);
    await createArticle(app, author.token);

    const dateKey = new Date().toISOString().slice(0, 10);
    const lockKey = `${DAILY_DIGEST_LOCK_KEY_PREFIX}:${dateKey}`;
    await (redisService as any).client.del(lockKey);

    const originalGet = configService.get.bind(configService);
    const configSpy = vi
      .spyOn(configService, 'get')
      .mockImplementation((key: string, defaultValue?: any) => {
        if (key === 'scheduler.enabled') return true;
        return originalGet(key, defaultValue);
      });
    const bulkSpy = vi.spyOn(mailService, 'sendDailyDigestEmailsBulk');

    try {
      const firstRun = await tasksService.handleDailyDigest();
      expect(firstRun).toEqual({
        skipped: false,
        articlesCount: 1,
        emailsQueued: 2,
      });
      expect(bulkSpy).toHaveBeenCalledTimes(1);

      const secondRun = await tasksService.handleDailyDigest();
      expect(secondRun).toEqual({
        skipped: true,
        articlesCount: 0,
        emailsQueued: 0,
      });
      expect(bulkSpy).toHaveBeenCalledTimes(1);
    } finally {
      configSpy.mockRestore();
      bulkSpy.mockRestore();
      await (redisService as any).client.del(lockKey);
    }
  });
});
