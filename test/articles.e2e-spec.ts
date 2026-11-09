import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { HttpExceptionFilter } from './../src/common/filters/http-exception.filter.js';
import { TransformInterceptor } from './../src/common/interceptors/transform.interceptor.js';

describe('ArticlesController (e2e) - Overview Practice', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalInterceptors(new TransformInterceptor());
    app.useGlobalFilters(new HttpExceptionFilter());

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  // Test Case 1: GET /articles
  it('GET /api/v1/articles -> 200 OK (Danh sách bài viết)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/articles')
      .expect(200);

    expect(res.body.data).toEqual([
      { id: 1, title: 'Learn NestJS' },
      { id: 2, title: 'Build REST API' },
    ]);
  });

  // Test Case 2: GET /articles/1
  it('GET /api/v1/articles/1 -> 200 OK (Chi tiết bài viết tồn tại)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/articles/1')
      .expect(200);

    expect(res.body.data).toEqual({ id: 1, title: 'Learn NestJS' });
  });

  // Test Case 3: GET /articles/abc (ParseIntPipe lỗi)
  it('GET /api/v1/articles/abc -> 400 Bad Request (ParseIntPipe bắt chuỗi ký tự)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/articles/abc')
      .expect(400);

    expect(res.body.statusCode).toBe(400);
    expect(res.body.message).toContain('Validation failed (numeric string is expected)');
  });

  // Test Case 4: GET /articles/999 (NotFoundException)
  it('GET /api/v1/articles/999 -> 404 Not Found (Không tìm thấy bài viết)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/articles/999')
      .expect(404);

    expect(res.body.statusCode).toBe(404);
    expect(res.body.message).toBe('Article not found');
  });
});

