import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter.js';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor.js';
import { MailService } from '../src/modules/mail/mail.service.js';

process.env.NODE_ENV = 'test';

describe('Comments & Mail Notification Queue (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let mailService: MailService;
  let authorToken: string;
  let commenterToken: string;
  let articleSlug: string;
  let secondArticleSlug: string;
  let createdCommentId: string;

  const uniqueSuffix = Date.now();
  const author = {
    username: `c_author_${uniqueSuffix}`,
    email: `c_author_${uniqueSuffix}@example.com`,
    password: 'Password@123',
  };
  const commenter = {
    username: `c_reader_${uniqueSuffix}`,
    email: `c_reader_${uniqueSuffix}@example.com`,
    password: 'Password@123',
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    app.useGlobalInterceptors(new TransformInterceptor());
    app.useGlobalFilters(new HttpExceptionFilter());

    await app.init();
    app.getHttpServer().setMaxListeners(25);
    dataSource = app.get(DataSource);
    mailService = app.get(MailService);

    const dbName = dataSource.options.database as string;
    if (dbName && dbName.includes('test')) {
      await dataSource.query('DELETE FROM comments');
      await dataSource.query('DELETE FROM favorites');
      await dataSource.query('DELETE FROM article_tags');
      await dataSource.query('DELETE FROM articles');
      await dataSource.query('DELETE FROM tags');
      await dataSource.query('DELETE FROM follows');
      await dataSource.query('DELETE FROM users');
    }

    const authorRes = await request(app.getHttpServer())
      .post('/api/v1/users')
      .send({ user: author })
      .expect(201);
    authorToken = authorRes.body.data.user.token;

    const commenterRes = await request(app.getHttpServer())
      .post('/api/v1/users')
      .send({ user: commenter })
      .expect(201);
    commenterToken = commenterRes.body.data.user.token;

    const articleRes = await request(app.getHttpServer())
      .post('/api/v1/articles')
      .set('Authorization', `Bearer ${authorToken}`)
      .send({
        article: {
          title: 'Pull 5 Comments Article',
          description: 'Testing comments and BullMQ',
          body: 'Article body content',
          tagList: ['nestjs', 'bullmq'],
        },
      })
      .expect(201);
    articleSlug = articleRes.body.data.article.slug;

    const secondArticleRes = await request(app.getHttpServer())
      .post('/api/v1/articles')
      .set('Authorization', `Bearer ${authorToken}`)
      .send({
        article: {
          title: 'Second Article For Scoping',
          description: 'Desc 2',
          body: 'Body 2',
        },
      })
      .expect(201);
    secondArticleSlug = secondArticleRes.body.data.article.slug;
  });

  afterAll(async () => {
    if (dataSource && dataSource.isInitialized) {
      const dbName = dataSource.options.database as string;
      if (dbName && dbName.includes('test')) {
        await dataSource.query('DELETE FROM comments');
        await dataSource.query('DELETE FROM favorites');
        await dataSource.query('DELETE FROM article_tags');
        await dataSource.query('DELETE FROM articles');
        await dataSource.query('DELETE FROM tags');
        await dataSource.query('DELETE FROM follows');
        await dataSource.query('DELETE FROM users');
      }
    }
    await app.close();
  });

  describe('POST /api/v1/articles/:slug/comments', () => {
    it('401 Unauthorized when missing JWT token', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/articles/${articleSlug}/comments`)
        .send({ comment: { body: 'Unauthenticated comment' } })
        .expect(401);
    });

    it('400 Bad Request when comment body is blank', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/articles/${articleSlug}/comments`)
        .set('Authorization', `Bearer ${commenterToken}`)
        .send({ comment: { body: '    ' } })
        .expect(400);
    });

    it('404 Not Found when article slug does not exist', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/articles/non-existent-slug-9999/comments')
        .set('Authorization', `Bearer ${commenterToken}`)
        .send({ comment: { body: 'Hello' } })
        .expect(404);
    });

    it('201 Created adds comment and enqueues email notification to article author', async () => {
      const notifySpy = vi.spyOn(mailService, 'sendNewCommentNotification');

      const res = await request(app.getHttpServer())
        .post(`/api/v1/articles/${articleSlug}/comments`)
        .set('Authorization', `Bearer ${commenterToken}`)
        .send({ comment: { body: '  His name was my name too.  ' } })
        .expect(201);

      const comment = res.body.data.comment;
      expect(comment.id).toBeDefined();
      expect(comment.body).toBe('His name was my name too.');
      expect(comment.author).toEqual({
        username: commenter.username,
        bio: null,
        image: null,
        following: false,
      });
      expect(notifySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientEmail: author.email,
          commenterUsername: commenter.username,
          articleSlug,
          commentBody: 'His name was my name too.',
        }),
      );

      createdCommentId = comment.id;
      notifySpy.mockRestore();
    });
  });

  describe('GET /api/v1/articles/:slug/comments', () => {
    it('404 Not Found when article slug does not exist', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/articles/non-existent-slug-9999/comments')
        .expect(404);
    });

    it('200 OK returns comments with following=false for unauthenticated viewer', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/articles/${articleSlug}/comments`)
        .expect(200);

      expect(res.body.data.comments).toHaveLength(1);
      expect(res.body.data.comments[0].id).toBe(createdCommentId);
      expect(res.body.data.comments[0].author.following).toBe(false);
    });

    it('200 OK returns following=true after viewer follows commenter', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/profiles/${commenter.username}/follow`)
        .set('Authorization', `Bearer ${authorToken}`)
        .expect(200);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/articles/${articleSlug}/comments`)
        .set('Authorization', `Bearer ${authorToken}`)
        .expect(200);

      expect(res.body.data.comments).toHaveLength(1);
      expect(res.body.data.comments[0].author.following).toBe(true);
    });
  });

  describe('DELETE /api/v1/articles/:slug/comments/:id', () => {
    it('401 Unauthorized when missing JWT token', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/articles/${articleSlug}/comments/${createdCommentId}`)
        .expect(401);
    });

    it('400 Bad Request when comment id is not a valid UUID', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/articles/${articleSlug}/comments/not-a-uuid`)
        .set('Authorization', `Bearer ${commenterToken}`)
        .expect(400);
    });

    it('404 Not Found when comment does not belong to target article slug', async () => {
      await request(app.getHttpServer())
        .delete(
          `/api/v1/articles/${secondArticleSlug}/comments/${createdCommentId}`,
        )
        .set('Authorization', `Bearer ${commenterToken}`)
        .expect(404);
    });

    it('403 Forbidden when another user attempts to delete the comment', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/articles/${articleSlug}/comments/${createdCommentId}`)
        .set('Authorization', `Bearer ${authorToken}`)
        .expect(403);
    });

    it('200 OK deletes comment when requested by comment author', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/articles/${articleSlug}/comments/${createdCommentId}`)
        .set('Authorization', `Bearer ${commenterToken}`)
        .expect(200);

      expect(res.body.data.message).toBe('Comment deleted successfully');

      const listRes = await request(app.getHttpServer())
        .get(`/api/v1/articles/${articleSlug}/comments`)
        .expect(200);
      expect(listRes.body.data.comments).toEqual([]);
    });
  });
});
