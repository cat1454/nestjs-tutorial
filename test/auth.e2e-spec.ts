import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter.js';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor.js';

describe('Auth Flow (e2e)', () => {
  let app: INestApplication<App>;
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
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /api/v1/users -> 201 Created (Đăng ký tài khoản mới)', async () => {
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

  it('POST /api/v1/users -> 409 Conflict (Đăng ký trùng email/username)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/users')
      .send({ user: testUser })
      .expect(409);

    expect(res.body.statusCode).toBe(409);
    expect(res.body.message).toMatch(/(Email|Username) này đã được sử dụng/);
  });

  it('POST /api/v1/users/login -> 200 OK (Đăng nhập đúng credentials)', async () => {
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

  it('POST /api/v1/users/login -> 401 Unauthorized (Đăng nhập sai mật khẩu)', async () => {
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

  it('GET /api/v1/user -> 200 OK (Lấy thông tin user hiện tại với Bearer token)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/user')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);

    expect(res.body.data.user.email).toBe(testUser.email);
    expect(res.body.data.user.username).toBe(testUser.username);
  });

  it('GET /api/v1/user -> 401 Unauthorized (Không truyền token)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/user')
      .expect(401);

    expect(res.body.statusCode).toBe(401);
    expect(res.body.message).toBe('Missing authorization token');
  });

  it('POST /api/v1/users/logout -> 200 OK (Đăng xuất đưa token vào Redis blacklist)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/users/logout')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);

    expect(res.body.statusCode).toBe(200);
    expect(res.body.message).toContain('Đăng xuất thành công');
  });

  it('GET /api/v1/user -> 401 Unauthorized (Gọi API với token đã bị thu hồi sau khi logout)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/user')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(401);

    expect(res.body.statusCode).toBe(401);
    expect(res.body.message).toBe('Token has been revoked');
  });
});
