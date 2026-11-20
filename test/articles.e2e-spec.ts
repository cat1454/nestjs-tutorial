import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter.js';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor.js';

process.env.NODE_ENV = 'test';

describe('Articles CRUD, Feed, Tags & Favorites (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let authorToken: string;
  let readerToken: string;
  let createdSlug: string;
  let secondSlug: string;

  const uniqueSuffix = Date.now();
  const author = {
    username: `author_${uniqueSuffix}`,
    email: `author_${uniqueSuffix}@example.com`,
    password: 'Password@123',
  };
  const reader = {
    username: `reader_${uniqueSuffix}`,
    email: `reader_${uniqueSuffix}@example.com`,
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

    const dbName = dataSource.options.database as string;
    if (dbName && dbName.includes('test')) {
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

    const readerRes = await request(app.getHttpServer())
      .post('/api/v1/users')
      .send({ user: reader })
      .expect(201);
    readerToken = readerRes.body.data.user.token;
  });

  afterAll(async () => {
    if (dataSource && dataSource.isInitialized) {
      const dbName = dataSource.options.database as string;
      if (dbName && dbName.includes('test')) {
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

  describe('Create Article & Validation', () => {
    it('POST /api/v1/articles -> 401 Unauthorized (Missing auth token)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/articles')
        .send({
          article: {
            title: 'Unauthenticated Article',
            description: 'Desc',
            body: 'Body',
          },
        })
        .expect(401);
    });

    it('POST /api/v1/articles -> 400 Bad Request (Missing required fields & non-whitelisted properties)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/articles')
        .set('Authorization', `Bearer ${authorToken}`)
        .send({ article: { title: 'Only title' } })
        .expect(400);

      await request(app.getHttpServer())
        .post('/api/v1/articles')
        .set('Authorization', `Bearer ${authorToken}`)
        .send({
          article: {
            title: 'a'.repeat(256),
            description: 'Desc',
            body: 'Body',
          },
        })
        .expect(400);

      await request(app.getHttpServer())
        .post('/api/v1/articles')
        .set('Authorization', `Bearer ${authorToken}`)
        .send({
          article: {
            title: 'Too many tags',
            description: 'Desc',
            body: 'Body',
            tagList: Array.from({ length: 21 }, (_, idx) => `tag${idx}`),
          },
        })
        .expect(400);
    });

    it('POST /api/v1/articles -> 201 Created (Vietnamese title, normalized & deduplicated tags)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/articles')
        .set('Authorization', `Bearer ${authorToken}`)
        .send({
          article: {
            title: 'Hướng dẫn xây dựng NestJS Conduit',
            description: 'Tutorial chuẩn Sun*',
            body: 'Nội dung chi tiết về NestJS và TypeORM.',
            tagList: ['  NestJS ', 'TypeORM', 'nestjs', ''],
          },
        })
        .expect(201);

      const article = res.body.data.article;
      expect(article.slug).toMatch(
        /^huong-dan-xay-dung-nestjs-conduit-[0-9a-f]{8}$/,
      );
      expect(article.title).toBe('Hướng dẫn xây dựng NestJS Conduit');
      expect(article.tagList).toEqual(['nestjs', 'typeorm']);
      expect(article.favorited).toBe(false);
      expect(article.favoritesCount).toBe(0);
      expect(article.author.username).toBe(author.username);
      createdSlug = article.slug;
    });

    it('POST /api/v1/articles -> 201 Created (Duplicate title generates distinct unique slug)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/articles')
        .set('Authorization', `Bearer ${readerToken}`)
        .send({
          article: {
            title: 'Hướng dẫn xây dựng NestJS Conduit',
            description: 'Another author same title',
            body: 'Different body content',
            tagList: ['nestjs', 'redis'],
          },
        })
        .expect(201);

      expect(res.body.data.article.slug).not.toBe(createdSlug);
      secondSlug = res.body.data.article.slug;
    });

    it('POST /api/v1/articles -> 201 Created (Symbol-only title falls back safely to article-slug)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/articles')
        .set('Authorization', `Bearer ${authorToken}`)
        .send({
          article: {
            title: '!!! ???',
            description: 'Edge case title',
            body: 'Edge case body',
          },
        })
        .expect(201);

      expect(res.body.data.article.slug).toMatch(/^article-[0-9a-f]{8}$/);

      await request(app.getHttpServer())
        .delete(`/api/v1/articles/${res.body.data.article.slug}`)
        .set('Authorization', `Bearer ${authorToken}`)
        .expect(200);
    });
  });

  describe('Get, List, Filter, Pagination & i18n', () => {
    it('GET /api/v1/articles/:slug -> 200 OK & 404 Not Found with en/vi i18n messages', async () => {
      const okRes = await request(app.getHttpServer())
        .get(`/api/v1/articles/${createdSlug}`)
        .expect(200);
      expect(okRes.body.data.article.slug).toBe(createdSlug);

      const notFoundEn = await request(app.getHttpServer())
        .get('/api/v1/articles/non-existent-slug-9999')
        .set('Accept-Language', 'en')
        .expect(404);
      expect(notFoundEn.body.message).toBe('Article not found');

      const notFoundVi = await request(app.getHttpServer())
        .get('/api/v1/articles/non-existent-slug-9999')
        .set('Accept-Language', 'vi')
        .expect(404);
      expect(notFoundVi.body.message).toBe('Không tìm thấy bài viết');
    });

    it('GET /api/v1/articles -> 400 Bad Request on invalid limit/offset bounds', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/articles?limit=0')
        .expect(400);

      await request(app.getHttpServer())
        .get('/api/v1/articles?limit=101')
        .expect(400);

      await request(app.getHttpServer())
        .get('/api/v1/articles?offset=-1')
        .expect(400);
    });

    it('GET /api/v1/articles -> 200 OK (Ordering newest-first, pagination, and full tagList preserved when filtering by tag)', async () => {
      const page1 = await request(app.getHttpServer())
        .get('/api/v1/articles?limit=1&offset=0')
        .expect(200);
      expect(page1.body.data.articlesCount).toBe(2);
      expect(page1.body.data.articles).toHaveLength(1);
      expect(page1.body.data.articles[0].slug).toBe(secondSlug);

      const page2 = await request(app.getHttpServer())
        .get('/api/v1/articles?limit=1&offset=1')
        .expect(200);
      expect(page2.body.data.articlesCount).toBe(2);
      expect(page2.body.data.articles).toHaveLength(1);
      expect(page2.body.data.articles[0].slug).toBe(createdSlug);

      const pastEnd = await request(app.getHttpServer())
        .get('/api/v1/articles?limit=10&offset=50')
        .expect(200);
      expect(pastEnd.body.data.articlesCount).toBe(2);
      expect(pastEnd.body.data.articles).toEqual([]);

      const byTag = await request(app.getHttpServer())
        .get('/api/v1/articles?tag=typeorm')
        .expect(200);
      expect(byTag.body.data.articlesCount).toBe(1);
      expect(byTag.body.data.articles[0].tagList).toEqual([
        'nestjs',
        'typeorm',
      ]);

      const byAuthor = await request(app.getHttpServer())
        .get(`/api/v1/articles?author=${author.username}`)
        .expect(200);
      expect(byAuthor.body.data.articlesCount).toBe(1);
      expect(byAuthor.body.data.articles[0].slug).toBe(createdSlug);
    });
  });

  describe('Favorite / Unfavorite & Combined Filters', () => {
    it('POST/DELETE /api/v1/articles/:slug/favorite -> 401 without token & 404 for unknown slug', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/articles/${createdSlug}/favorite`)
        .expect(401);

      await request(app.getHttpServer())
        .post('/api/v1/articles/unknown-slug-123/favorite')
        .set('Authorization', `Bearer ${readerToken}`)
        .expect(404);

      await request(app.getHttpServer())
        .delete('/api/v1/articles/unknown-slug-123/favorite')
        .set('Authorization', `Bearer ${readerToken}`)
        .expect(404);
    });

    it('POST /api/v1/articles/:slug/favorite -> idempotent for same user, increments across multiple users, and works with combined filters', async () => {
      const fav1 = await request(app.getHttpServer())
        .post(`/api/v1/articles/${createdSlug}/favorite`)
        .set('Authorization', `Bearer ${readerToken}`)
        .expect(200);
      expect(fav1.body.data.article.favorited).toBe(true);
      expect(fav1.body.data.article.favoritesCount).toBe(1);

      const favRepeat = await request(app.getHttpServer())
        .post(`/api/v1/articles/${createdSlug}/favorite`)
        .set('Authorization', `Bearer ${readerToken}`)
        .expect(200);
      expect(favRepeat.body.data.article.favoritesCount).toBe(1);

      const favByAuthor = await request(app.getHttpServer())
        .post(`/api/v1/articles/${createdSlug}/favorite`)
        .set('Authorization', `Bearer ${authorToken}`)
        .expect(200);
      expect(favByAuthor.body.data.article.favoritesCount).toBe(2);

      const combinedFilter = await request(app.getHttpServer())
        .get(
          `/api/v1/articles?tag=nestjs&author=${author.username}&favorited=${reader.username}`,
        )
        .set('Authorization', `Bearer ${readerToken}`)
        .expect(200);
      expect(combinedFilter.body.data.articlesCount).toBe(1);
      expect(combinedFilter.body.data.articles[0].favorited).toBe(true);
      expect(combinedFilter.body.data.articles[0].favoritesCount).toBe(2);
    });

    it('DELETE /api/v1/articles/:slug/favorite -> decrements count and is idempotent when already unfavorited', async () => {
      const unfav1 = await request(app.getHttpServer())
        .delete(`/api/v1/articles/${createdSlug}/favorite`)
        .set('Authorization', `Bearer ${readerToken}`)
        .expect(200);
      expect(unfav1.body.data.article.favorited).toBe(false);
      expect(unfav1.body.data.article.favoritesCount).toBe(1);

      const unfavRepeat = await request(app.getHttpServer())
        .delete(`/api/v1/articles/${createdSlug}/favorite`)
        .set('Authorization', `Bearer ${readerToken}`)
        .expect(200);
      expect(unfavRepeat.body.data.article.favoritesCount).toBe(1);

      await request(app.getHttpServer())
        .delete(`/api/v1/articles/${createdSlug}/favorite`)
        .set('Authorization', `Bearer ${authorToken}`)
        .expect(200);
    });
  });

  describe('Feed Articles & Tags', () => {
    it('GET /api/v1/articles/feed -> 401 without token & 400 on invalid pagination', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/articles/feed')
        .expect(401);

      await request(app.getHttpServer())
        .get('/api/v1/articles/feed?limit=0')
        .set('Authorization', `Bearer ${readerToken}`)
        .expect(400);
    });

    it('GET /api/v1/articles/feed -> updates dynamically after follow and unfollow', async () => {
      const beforeFollow = await request(app.getHttpServer())
        .get('/api/v1/articles/feed')
        .set('Authorization', `Bearer ${readerToken}`)
        .expect(200);
      expect(beforeFollow.body.data.articlesCount).toBe(0);

      await request(app.getHttpServer())
        .post(`/api/v1/profiles/${author.username}/follow`)
        .set('Authorization', `Bearer ${readerToken}`)
        .expect(200);

      const afterFollow = await request(app.getHttpServer())
        .get('/api/v1/articles/feed?limit=10&offset=0')
        .set('Authorization', `Bearer ${readerToken}`)
        .expect(200);
      expect(afterFollow.body.data.articlesCount).toBe(1);
      expect(afterFollow.body.data.articles[0].slug).toBe(createdSlug);
      expect(afterFollow.body.data.articles[0].author.following).toBe(true);

      await request(app.getHttpServer())
        .delete(`/api/v1/profiles/${author.username}/follow`)
        .set('Authorization', `Bearer ${readerToken}`)
        .expect(200);

      const afterUnfollow = await request(app.getHttpServer())
        .get('/api/v1/articles/feed')
        .set('Authorization', `Bearer ${readerToken}`)
        .expect(200);
      expect(afterUnfollow.body.data.articlesCount).toBe(0);
    });

    it('GET /api/v1/tags -> 200 OK returns all distinct sorted tags', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/tags')
        .expect(200);

      expect(res.body.data.tags).toEqual(['nestjs', 'redis', 'typeorm']);
    });
  });

  describe('Update & Delete Article Authorization & Edge Cases', () => {
    it('PUT /api/v1/articles/:slug -> 400 Bad Request when explicit null or blank whitespace is sent', async () => {
      await request(app.getHttpServer())
        .put(`/api/v1/articles/${createdSlug}`)
        .set('Authorization', `Bearer ${authorToken}`)
        .send({ article: { title: null } })
        .expect(400);

      await request(app.getHttpServer())
        .put(`/api/v1/articles/${createdSlug}`)
        .set('Authorization', `Bearer ${authorToken}`)
        .send({ article: { description: null } })
        .expect(400);

      await request(app.getHttpServer())
        .put(`/api/v1/articles/${createdSlug}`)
        .set('Authorization', `Bearer ${authorToken}`)
        .send({ article: { body: null } })
        .expect(400);

      await request(app.getHttpServer())
        .put(`/api/v1/articles/${createdSlug}`)
        .set('Authorization', `Bearer ${authorToken}`)
        .send({ article: { title: '   ' } })
        .expect(400);
    });

    it('PUT /api/v1/articles/:slug -> 401 without token, 404 unknown slug, 403 non-author', async () => {
      await request(app.getHttpServer())
        .put(`/api/v1/articles/${createdSlug}`)
        .send({ article: { title: 'No auth' } })
        .expect(401);

      await request(app.getHttpServer())
        .put('/api/v1/articles/non-existent-slug')
        .set('Authorization', `Bearer ${authorToken}`)
        .send({ article: { title: 'Missing' } })
        .expect(404);

      await request(app.getHttpServer())
        .put(`/api/v1/articles/${createdSlug}`)
        .set('Authorization', `Bearer ${readerToken}`)
        .send({ article: { title: 'Unauthorized Edit' } })
        .expect(403);
    });

    it('PUT /api/v1/articles/:slug -> preserves slug when title unchanged, regenerates slug when title changed', async () => {
      const keepSlugRes = await request(app.getHttpServer())
        .put(`/api/v1/articles/${createdSlug}`)
        .set('Authorization', `Bearer ${authorToken}`)
        .send({ article: { description: 'Only description changed' } })
        .expect(200);
      expect(keepSlugRes.body.data.article.slug).toBe(createdSlug);
      expect(keepSlugRes.body.data.article.description).toBe(
        'Only description changed',
      );

      const newSlugRes = await request(app.getHttpServer())
        .put(`/api/v1/articles/${createdSlug}`)
        .set('Authorization', `Bearer ${authorToken}`)
        .send({
          article: {
            title: 'Updated NestJS Conduit Guide',
            description: 'Updated description',
          },
        })
        .expect(200);

      expect(newSlugRes.body.data.article.title).toBe(
        'Updated NestJS Conduit Guide',
      );
      expect(newSlugRes.body.data.article.slug).toMatch(
        /^updated-nestjs-conduit-guide-[0-9a-f]{8}$/,
      );
      expect(newSlugRes.body.data.article.slug).not.toBe(createdSlug);
      createdSlug = newSlugRes.body.data.article.slug;
    });

    it('DELETE /api/v1/articles/:slug -> 401 without token, 404 unknown slug, 403 non-author, 200 author with i18n', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/articles/${createdSlug}`)
        .expect(401);

      await request(app.getHttpServer())
        .delete('/api/v1/articles/non-existent-slug')
        .set('Authorization', `Bearer ${authorToken}`)
        .expect(404);

      await request(app.getHttpServer())
        .delete(`/api/v1/articles/${createdSlug}`)
        .set('Authorization', `Bearer ${readerToken}`)
        .expect(403);

      const deleteRes = await request(app.getHttpServer())
        .delete(`/api/v1/articles/${createdSlug}`)
        .set('Authorization', `Bearer ${authorToken}`)
        .set('Accept-Language', 'vi')
        .expect(200);
      expect(deleteRes.body.message).toBe('Xóa bài viết thành công');

      await request(app.getHttpServer())
        .get(`/api/v1/articles/${createdSlug}`)
        .expect(404);
    });
  });

  describe('Concurrency, Multi-Tag Pagination, Fuzzing & Security Probes', () => {
    it('Concurrency: 10 parallel POST /api/v1/articles with identical title & brand-new tag should all return 201 with 10 unique slugs', async () => {
      const results = await Promise.all(
        Array.from({ length: 10 }, () =>
          request(app.getHttpServer())
            .post('/api/v1/articles')
            .set('Authorization', `Bearer ${authorToken}`)
            .send({
              article: {
                title: 'Parallel Concurrency Test Article',
                description: 'Testing concurrent tag upsert and slug uniqueness',
                body: 'Concurrent body content',
                tagList: ['race-tag-a', 'race-tag-b', 'race-tag-c'],
              },
            }),
        ),
      );

      for (const res of results) {
        expect(res.status).toBe(201);
        expect(res.body.data.article.tagList).toEqual([
          'race-tag-a',
          'race-tag-b',
          'race-tag-c',
        ]);
      }

      const slugs = new Set(results.map((r) => r.body.data.article.slug));
      expect(slugs.size).toBe(10);
    });

    it('TypeORM Multi-Tag Pagination: filtering by shared tag with limit/offset returns exact page size without losing other tags or duplicating rows', async () => {
      const page1 = await request(app.getHttpServer())
        .get('/api/v1/articles?tag=race-tag-a&limit=3&offset=0')
        .expect(200);
      expect(page1.body.data.articlesCount).toBe(10);
      expect(page1.body.data.articles).toHaveLength(3);
      for (const article of page1.body.data.articles) {
        expect(article.tagList).toEqual([
          'race-tag-a',
          'race-tag-b',
          'race-tag-c',
        ]);
      }

      const page2 = await request(app.getHttpServer())
        .get('/api/v1/articles?tag=race-tag-a&limit=3&offset=3')
        .expect(200);
      expect(page2.body.data.articlesCount).toBe(10);
      expect(page2.body.data.articles).toHaveLength(3);

      const page1Slugs = new Set(
        page1.body.data.articles.map((a: { slug: string }) => a.slug),
      );
      for (const article of page2.body.data.articles) {
        expect(page1Slugs.has(article.slug)).toBe(false);
      }
    });

    it('Concurrency: 10 parallel favorite & 10 parallel unfavorite requests from same user stay atomic and never 500', async () => {
      const favResults = await Promise.all(
        Array.from({ length: 10 }, () =>
          request(app.getHttpServer())
            .post(`/api/v1/articles/${secondSlug}/favorite`)
            .set('Authorization', `Bearer ${authorToken}`),
        ),
      );

      for (const res of favResults) {
        expect(res.status).toBe(200);
        expect(res.body.data.article.favorited).toBe(true);
        expect(res.body.data.article.favoritesCount).toBe(1);
      }

      const unfavResults = await Promise.all(
        Array.from({ length: 10 }, () =>
          request(app.getHttpServer())
            .delete(`/api/v1/articles/${secondSlug}/favorite`)
            .set('Authorization', `Bearer ${authorToken}`),
        ),
      );

      for (const res of unfavResults) {
        expect(res.status).toBe(200);
        expect(res.body.data.article.favorited).toBe(false);
        expect(res.body.data.article.favoritesCount).toBe(0);
      }
    });

    it('Fuzzing & Input Hardening: rejects whitespace-only body, non-string tagList items, unknown update fields, and handles empty update cleanly', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/articles')
        .set('Authorization', `Bearer ${authorToken}`)
        .send({
          article: {
            title: 'Valid title',
            description: 'Valid description',
            body: '     ',
          },
        })
        .expect(400);

      await request(app.getHttpServer())
        .post('/api/v1/articles')
        .set('Authorization', `Bearer ${authorToken}`)
        .send({
          article: {
            title: 'Bad tagList elements',
            description: 'Desc',
            body: 'Body',
            tagList: [123, null, { bad: true }],
          },
        })
        .expect(400);

      await request(app.getHttpServer())
        .put(`/api/v1/articles/${secondSlug}`)
        .set('Authorization', `Bearer ${readerToken}`)
        .send({
          article: {
            body: '   ',
          },
        })
        .expect(400);

      await request(app.getHttpServer())
        .put(`/api/v1/articles/${secondSlug}`)
        .set('Authorization', `Bearer ${readerToken}`)
        .send({
          article: {
            tagList: ['hacked'],
          },
        })
        .expect(400);

      const emptyUpdate = await request(app.getHttpServer())
        .put(`/api/v1/articles/${secondSlug}`)
        .set('Authorization', `Bearer ${readerToken}`)
        .send({ article: {} })
        .expect(200);
      expect(emptyUpdate.body.data.article.slug).toBe(secondSlug);
    });

    it('Security: SQL injection strings in filters/slugs and invalid/revoked tokens on optional-auth routes', async () => {
      const sqliTag = await request(app.getHttpServer())
        .get(`/api/v1/articles?tag=${encodeURIComponent("' OR '1'='1")}`)
        .expect(200);
      expect(sqliTag.body.data.articlesCount).toBe(0);

      const sqliAuthor = await request(app.getHttpServer())
        .get(
          `/api/v1/articles?author=${encodeURIComponent("admin'; DROP TABLE articles;--")}`,
        )
        .expect(200);
      expect(sqliAuthor.body.data.articlesCount).toBe(0);

      await request(app.getHttpServer())
        .get(`/api/v1/articles/${encodeURIComponent("' OR 1=1--")}`)
        .expect(404);

      const emptyQueryParams = await request(app.getHttpServer())
        .get('/api/v1/articles?tag=&author=&favorited=')
        .expect(200);
      expect(emptyQueryParams.body.data.articlesCount).toBeGreaterThanOrEqual(1);

      await request(app.getHttpServer())
        .get('/api/v1/articles')
        .set('Authorization', 'Bearer tampered.invalid.jwt')
        .expect(401);

      const tempUserRes = await request(app.getHttpServer())
        .post('/api/v1/users')
        .send({
          user: {
            username: `temp_${uniqueSuffix}`,
            email: `temp_${uniqueSuffix}@example.com`,
            password: 'Password@123',
          },
        })
        .expect(201);
      const tempToken: string = tempUserRes.body.data.user.token;

      await request(app.getHttpServer())
        .post('/api/v1/users/logout')
        .set('Authorization', `Bearer ${tempToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .get(`/api/v1/articles/${secondSlug}`)
        .set('Authorization', `Bearer ${tempToken}`)
        .expect(401);
    });
  });
});
