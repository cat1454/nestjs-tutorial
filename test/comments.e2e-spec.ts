import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MailService } from '../src/modules/mail/mail.service.js';
import { createTestApp } from './helpers/create-test-app.js';
import { truncateDatabase } from './helpers/database.helper.js';
import {
  buildRegisterPayload,
  createArticle,
} from './helpers/factories.js';

describe('Comments & Mail Notification Queue (e2e)', () => {
  let app: NestExpressApplication;
  let dataSource: DataSource;
  let mailService: MailService;
  let authorToken: string;
  let commenterToken: string;
  let articleSlug: string;
  let secondArticleSlug: string;

  const author = buildRegisterPayload();
  const commenter = buildRegisterPayload();

  beforeAll(async () => {
    ({ app, dataSource } = await createTestApp());
    mailService = app.get(MailService);
    await truncateDatabase(dataSource);

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

    const firstArticle = await createArticle(app, authorToken, {
      title: 'Pull 5 Comments Article',
      tagList: ['nestjs', 'bullmq'],
    });
    articleSlug = firstArticle.slug;

    const secondArticle = await createArticle(app, authorToken, {
      title: 'Second Article For Scoping',
      tagList: [],
    });
    secondArticleSlug = secondArticle.slug;
  });

  afterAll(async () => {
    await truncateDatabase(dataSource);
    await app.close();
  });

  describe('POST /api/v1/articles/:slug/comments', () => {
    beforeEach(async () => {
      await dataSource.query('DELETE FROM comments');
    });

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

      notifySpy.mockRestore();
    });
  });

  describe('GET /api/v1/articles/:slug/comments', () => {
    let firstCommentId: string;
    let secondCommentId: string;

    beforeEach(async () => {
      await dataSource.query('DELETE FROM comments');
      await dataSource.query('DELETE FROM follows');

      const firstRes = await request(app.getHttpServer())
        .post(`/api/v1/articles/${articleSlug}/comments`)
        .set('Authorization', `Bearer ${commenterToken}`)
        .send({ comment: { body: 'First comment' } })
        .expect(201);
      firstCommentId = firstRes.body.data.comment.id;

      await new Promise((resolve) => setTimeout(resolve, 15));

      const secondRes = await request(app.getHttpServer())
        .post(`/api/v1/articles/${articleSlug}/comments`)
        .set('Authorization', `Bearer ${commenterToken}`)
        .send({ comment: { body: 'Second newer comment' } })
        .expect(201);
      secondCommentId = secondRes.body.data.comment.id;
    });

    it('404 Not Found when article slug does not exist', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/articles/non-existent-slug-9999/comments')
        .expect(404);
    });

    it('200 OK returns comments ordered newest-first with following=false for unauthenticated viewer', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/articles/${articleSlug}/comments`)
        .expect(200);

      expect(res.body.data.comments).toHaveLength(2);
      expect(res.body.data.comments[0].id).toBe(secondCommentId);
      expect(res.body.data.comments[1].id).toBe(firstCommentId);
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

      expect(res.body.data.comments).toHaveLength(2);
      expect(res.body.data.comments[0].id).toBe(secondCommentId);
      expect(res.body.data.comments[0].author.following).toBe(true);
    });
  });

  describe('DELETE /api/v1/articles/:slug/comments/:id', () => {
    let commentId: string;

    beforeEach(async () => {
      await dataSource.query('DELETE FROM comments');

      const res = await request(app.getHttpServer())
        .post(`/api/v1/articles/${articleSlug}/comments`)
        .set('Authorization', `Bearer ${commenterToken}`)
        .send({ comment: { body: 'Comment to delete' } })
        .expect(201);
      commentId = res.body.data.comment.id;
    });

    it('401 Unauthorized when missing JWT token', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/articles/${articleSlug}/comments/${commentId}`)
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
        .delete(`/api/v1/articles/${secondArticleSlug}/comments/${commentId}`)
        .set('Authorization', `Bearer ${commenterToken}`)
        .expect(404);
    });

    it('403 Forbidden when another user attempts to delete the comment', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/articles/${articleSlug}/comments/${commentId}`)
        .set('Authorization', `Bearer ${authorToken}`)
        .expect(403);
    });

    it('200 OK deletes comment when requested by comment author', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/articles/${articleSlug}/comments/${commentId}`)
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
