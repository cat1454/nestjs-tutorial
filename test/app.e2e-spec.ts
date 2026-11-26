import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './helpers/create-test-app.js';

describe('Hello World API (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    ({ app } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it('/api/v1/hello (GET) - Default English greeting', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/hello')
      .expect(200);

    expect(res.body).toHaveProperty('statusCode', 200);
    expect(res.body.data.greeting).toContain('Hello, Sunner!');
    expect(res.body.data.locale).toBe('en');
  });

  it('/api/v1/hello (GET) - Vietnamese greeting via query param ?lang=vi&name=Binh', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/hello?lang=vi&name=Binh')
      .expect(200);

    expect(res.body).toHaveProperty('statusCode', 200);
    expect(res.body.data.greeting).toContain('Xin chào Binh!');
    expect(res.body.data.locale).toBe('vi');
  });

  it('/api/v1/hello (GET) - Vietnamese greeting via Header Accept-Language', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/hello')
      .set('Accept-Language', 'vi')
      .expect(200);

    expect(res.body).toHaveProperty('statusCode', 200);
    expect(res.body.data.greeting).toContain('Xin chào Sunner!');
    expect(res.body.data.locale).toBe('vi');
  });

  it('/api/v1/hello (GET) - Language alias ?l=vi works without 400', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/hello?l=vi&name=Codex')
      .expect(200);

    expect(res.body).toHaveProperty('statusCode', 200);
    expect(res.body.data.greeting).toContain('Xin chào Codex!');
    expect(res.body.data.locale).toBe('vi');
  });
});
