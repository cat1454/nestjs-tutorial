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

describe('Auth Flow (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let userToken: string;
  const uniqueSuffix = Date.now();
  const testUser = {
    username: `sunner_${uniqueSuffix}`,
    email: `sunner_${uniqueSuffix}@example.com`,
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
      await dataSource.query('DELETE FROM users');
    }
  });

  afterAll(async () => {
    if (dataSource && dataSource.isInitialized) {
      const dbName = dataSource.options.database as string;
      if (dbName && dbName.includes('test')) {
        await dataSource.query('DELETE FROM users');
      }
    }
    await app.close();
  });

  it('should connect to the dedicated test database', () => {
    const dbName = dataSource.options.database as string;
    expect(dbName).toContain('test');
  });

  it('POST /api/v1/users -> 400 Bad Request (Password exceeds 72 bytes)', async () => {
    const longPassword = 'a'.repeat(73);
    const res = await request(app.getHttpServer())
      .post('/api/v1/users')
      .send({
        user: {
          username: 'longpassuser',
          email: 'longpass@example.com',
          password: longPassword,
        },
      })
      .expect(400);

    expect(res.body.statusCode).toBe(400);
  });

  it('POST /api/v1/users -> 201 Created (Register new account)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/users')
      .send({ user: testUser })
      .expect(201);

    expect(res.body.data).toHaveProperty('user');
    expect(res.body.data.user.email).toBe(testUser.email);
    expect(res.body.data.user.username).toBe(testUser.username);
    expect(res.body.data.user).toHaveProperty('token');
    expect(res.body.data.user).not.toHaveProperty('password');
    userToken = res.body.data.user.token;
  });

  it('POST /api/v1/users -> 409 Conflict (Duplicate case-insensitive email)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/users')
      .send({
        user: {
          username: 'another_username',
          email: testUser.email.toUpperCase(),
          password: testUser.password,
        },
      })
      .expect(409);

    expect(res.body.statusCode).toBe(409);
  });

  it('POST /api/v1/users/login -> 200 OK (Login with valid credentials)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/users/login')
      .send({
        user: {
          email: testUser.email,
          password: testUser.password,
        },
      })
      .expect(200);

    expect(res.body.data.user.email).toBe(testUser.email);
    expect(res.body.data.user.token).toBeDefined();
    userToken = res.body.data.user.token;
  });

  it('POST /api/v1/users/login -> 401 Unauthorized (Wrong password)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/users/login')
      .send({
        user: {
          email: testUser.email,
          password: 'WrongPassword123',
        },
      })
      .expect(401);

    expect(res.body.statusCode).toBe(401);
  });

  it('GET /api/v1/user -> 200 OK (Get current user with Bearer token)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/user')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);

    expect(res.body.data.user.email).toBe(testUser.email);
    expect(res.body.data.user.username).toBe(testUser.username);
  });

  it('GET /api/v1/user -> 401 Unauthorized (Missing token)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/user')
      .expect(401);

    expect(res.body.statusCode).toBe(401);
  });

  it('POST /api/v1/users/logout -> 200 OK (Logout and add token jti to Redis blacklist)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/users/logout')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);

    expect(res.body.statusCode).toBe(200);
  });

  it('GET /api/v1/user -> 401 Unauthorized (Access denied with revoked token)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/user')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(401);

    expect(res.body.statusCode).toBe(401);
  });

  it('POST /api/v1/users/login -> 429 Too Many Requests (Rate limit exceeded)', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      const res = await request(app.getHttpServer())
        .post('/api/v1/users/login')
        .send({
          user: {
            email: testUser.email,
            password: 'WrongPassword123',
          },
        });
      statuses.push(res.status);
    }

    expect(statuses).toContain(429);
  });
});
