import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { TransformInterceptor } from './../src/common/interceptors/transform.interceptor.js';

describe('Hello World API (e2e)', () => {
  let app: INestApplication<App>;

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
      }),
    );
    app.useGlobalInterceptors(new TransformInterceptor());

    await app.init();
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
