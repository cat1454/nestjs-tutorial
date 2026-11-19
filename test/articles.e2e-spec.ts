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

  it('POST /api/v1/articles -> 401 Unauthorized (Require authentication)', async () => {
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

  it('POST /api/v1/articles -> 201 Created (Create article with tags and auto-generated slug)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/articles')
      .set('Authorization', `Bearer ${authorToken}`)
      .send({
        article: {
          title: 'Hướng dẫn xây dựng NestJS Conduit',
          description: 'Tutorial chuẩn Sun*',
          body: 'Nội dung chi tiết về NestJS và TypeORM.',
          tagList: ['NestJS', 'TypeORM', 'nestjs'],
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

  it('GET /api/v1/articles/:slug -> 200 OK (Get article detail)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/articles/${createdSlug}`)
      .expect(200);

    expect(res.body.data.article.slug).toBe(createdSlug);
    expect(res.body.data.article.tagList).toEqual(['nestjs', 'typeorm']);
  });

  it('GET /api/v1/articles/:slug -> 404 Not Found (Non-existent slug)', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/articles/non-existent-slug-9999')
      .expect(404);
  });

  it('GET /api/v1/articles -> 200 OK (Filter by tag, author, and pagination)', async () => {
    const byTagRes = await request(app.getHttpServer())
      .get('/api/v1/articles?tag=nestjs&limit=10&offset=0')
      .expect(200);

    expect(byTagRes.body.data.articlesCount).toBe(1);
    expect(byTagRes.body.data.articles[0].slug).toBe(createdSlug);
    expect(byTagRes.body.data.articles[0].tagList).toEqual([
      'nestjs',
      'typeorm',
    ]);

    const byAuthorRes = await request(app.getHttpServer())
      .get(`/api/v1/articles?author=${author.username}`)
      .expect(200);
    expect(byAuthorRes.body.data.articlesCount).toBe(1);

    const emptyRes = await request(app.getHttpServer())
      .get('/api/v1/articles?tag=nonexistenttag')
      .expect(200);
    expect(emptyRes.body.data.articlesCount).toBe(0);
  });

  it('POST /api/v1/articles/:slug/favorite -> 200 OK & filter by favorited', async () => {
    const favRes = await request(app.getHttpServer())
      .post(`/api/v1/articles/${createdSlug}/favorite`)
      .set('Authorization', `Bearer ${readerToken}`)
      .expect(200);

    expect(favRes.body.data.article.favorited).toBe(true);
    expect(favRes.body.data.article.favoritesCount).toBe(1);

    const filterFavRes = await request(app.getHttpServer())
      .get(`/api/v1/articles?favorited=${reader.username}`)
      .set('Authorization', `Bearer ${readerToken}`)
      .expect(200);

    expect(filterFavRes.body.data.articlesCount).toBe(1);
    expect(filterFavRes.body.data.articles[0].favorited).toBe(true);
  });

  it('DELETE /api/v1/articles/:slug/favorite -> 200 OK (Unfavorite article)', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/api/v1/articles/${createdSlug}/favorite`)
      .set('Authorization', `Bearer ${readerToken}`)
      .expect(200);

    expect(res.body.data.article.favorited).toBe(false);
    expect(res.body.data.article.favoritesCount).toBe(0);
  });

  it('GET /api/v1/articles/feed -> 200 OK (Returns articles from followed authors only)', async () => {
    const emptyFeed = await request(app.getHttpServer())
      .get('/api/v1/articles/feed')
      .set('Authorization', `Bearer ${readerToken}`)
      .expect(200);
    expect(emptyFeed.body.data.articlesCount).toBe(0);

    await request(app.getHttpServer())
      .post(`/api/v1/profiles/${author.username}/follow`)
      .set('Authorization', `Bearer ${readerToken}`)
      .expect(200);

    const feedRes = await request(app.getHttpServer())
      .get('/api/v1/articles/feed?limit=10&offset=0')
      .set('Authorization', `Bearer ${readerToken}`)
      .expect(200);

    expect(feedRes.body.data.articlesCount).toBe(1);
    expect(feedRes.body.data.articles[0].slug).toBe(createdSlug);
    expect(feedRes.body.data.articles[0].author.following).toBe(true);
  });

  it('GET /api/v1/tags -> 200 OK (Returns distinct sorted tags)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/tags')
      .expect(200);

    expect(res.body.data.tags).toEqual(['nestjs', 'typeorm']);
  });

  it('PUT /api/v1/articles/:slug -> 403 Forbidden (Non-author cannot update)', async () => {
    await request(app.getHttpServer())
      .put(`/api/v1/articles/${createdSlug}`)
      .set('Authorization', `Bearer ${readerToken}`)
      .send({
        article: {
          title: 'Unauthorized Edit',
        },
      })
      .expect(403);
  });

  it('PUT /api/v1/articles/:slug -> 200 OK (Author updates title and regenerates slug)', async () => {
    const res = await request(app.getHttpServer())
      .put(`/api/v1/articles/${createdSlug}`)
      .set('Authorization', `Bearer ${authorToken}`)
      .send({
        article: {
          title: 'Updated NestJS Conduit Guide',
          description: 'Updated description',
        },
      })
      .expect(200);

    expect(res.body.data.article.title).toBe('Updated NestJS Conduit Guide');
    expect(res.body.data.article.slug).toMatch(
      /^updated-nestjs-conduit-guide-[0-9a-f]{8}$/,
    );
    expect(res.body.data.article.description).toBe('Updated description');
    createdSlug = res.body.data.article.slug;
  });

  it('DELETE /api/v1/articles/:slug -> 403 Forbidden (Non-author cannot delete)', async () => {
    await request(app.getHttpServer())
      .delete(`/api/v1/articles/${createdSlug}`)
      .set('Authorization', `Bearer ${readerToken}`)
      .expect(403);
  });

  it('DELETE /api/v1/articles/:slug -> 200 OK (Author deletes article)', async () => {
    await request(app.getHttpServer())
      .delete(`/api/v1/articles/${createdSlug}`)
      .set('Authorization', `Bearer ${authorToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/api/v1/articles/${createdSlug}`)
      .expect(404);
  });
});
