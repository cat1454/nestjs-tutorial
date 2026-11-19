import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test, TestingModule } from '@nestjs/testing';
import * as path from 'path';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter.js';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor.js';
import { MAX_AVATAR_FILE_SIZE_BYTES } from '../src/modules/attachments/attachments.constants.js';

process.env.NODE_ENV = 'test';

describe('Users, Profiles, Follow & Polymorphic Avatar Upload (e2e)', () => {
  let app: NestExpressApplication;
  let dataSource: DataSource;
  let aliceToken: string;
  let bobToken: string;

  const uniqueSuffix = Date.now();
  const alice = {
    username: `alice_${uniqueSuffix}`,
    email: `alice_${uniqueSuffix}@example.com`,
    password: 'Password@123',
  };
  const bob = {
    username: `bob_${uniqueSuffix}`,
    email: `bob_${uniqueSuffix}@example.com`,
    password: 'Password@123',
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestExpressApplication>();
    app.useStaticAssets(path.join(process.cwd(), 'public'), {
      prefix: '/public/',
    });
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
      await dataSource.query('DELETE FROM attachments');
      await dataSource.query('DELETE FROM follows');
      await dataSource.query('DELETE FROM users');
    }

    const aliceRes = await request(app.getHttpServer())
      .post('/api/v1/users')
      .send({ user: alice })
      .expect(201);
    aliceToken = aliceRes.body.data.user.token;

    const bobRes = await request(app.getHttpServer())
      .post('/api/v1/users')
      .send({ user: bob })
      .expect(201);
    bobToken = bobRes.body.data.user.token;
  });

  afterAll(async () => {
    if (dataSource && dataSource.isInitialized) {
      const dbName = dataSource.options.database as string;
      if (dbName && dbName.includes('test')) {
        await dataSource.query('DELETE FROM attachments');
        await dataSource.query('DELETE FROM follows');
        await dataSource.query('DELETE FROM users');
      }
    }
    await app.close();
  });

  it('PUT /api/v1/user -> 200 OK (Update user bio and valid https image URL)', async () => {
    const res = await request(app.getHttpServer())
      .put('/api/v1/user')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({
        user: {
          bio: 'Senior NestJS Engineer at Sun*',
          image: 'https://example.com/avatar.png',
        },
      })
      .expect(200);

    expect(res.body.data.user.bio).toBe('Senior NestJS Engineer at Sun*');
    expect(res.body.data.user.image).toBe('https://example.com/avatar.png');
  });

  it('PUT /api/v1/user -> 400 Bad Request (Reject javascript: XSS URL in image field)', async () => {
    await request(app.getHttpServer())
      .put('/api/v1/user')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({
        user: {
          image: 'javascript:alert(1)',
        },
      })
      .expect(400);
  });

  it('PUT /api/v1/user -> 200 OK (Upload valid PNG avatar, save polymorphic attachment with UUID, and serve from /public)', async () => {
    const pngBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64',
    );

    const res = await request(app.getHttpServer())
      .put('/api/v1/user')
      .set('Authorization', `Bearer ${aliceToken}`)
      .attach('avatar', pngBuffer, {
        filename: 'avatar.png',
        contentType: 'image/png',
      })
      .field('bio', 'Updated bio with avatar')
      .expect(200);

    const imageUrl: string = res.body.data.user.image;
    expect(imageUrl).toMatch(/^\/public\/uploads\/avatars\/[0-9a-f-]+\.png$/);
    expect(res.body.data.user.bio).toBe('Updated bio with avatar');

    const attachments = await dataSource.query(
      `SELECT id, target_type, target_id, url, file_name, file_type, file_size FROM attachments WHERE url = $1`,
      [imageUrl],
    );
    expect(attachments).toHaveLength(1);
    expect(attachments[0].target_type).toBe('User');
    expect(attachments[0].file_name).toBe('avatar.png');
    expect(attachments[0].file_type).toBe('image/png');
    expect(attachments[0].file_size).toBe(pngBuffer.length);
    expect(attachments[0].id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );

    const staticRes = await request(app.getHttpServer())
      .get(imageUrl)
      .expect(200);
    expect(staticRes.headers['content-type']).toContain('image/png');
  });

  it('PUT /api/v1/user -> 400 Bad Request (Reject HTML payload spoofed with image/png Content-Type)', async () => {
    const htmlBuffer = Buffer.from('<script>alert(1)</script>');

    await request(app.getHttpServer())
      .put('/api/v1/user')
      .set('Authorization', `Bearer ${aliceToken}`)
      .attach('avatar', htmlBuffer, {
        filename: 'avatar.html',
        contentType: 'image/png',
      })
      .expect(400);
  });

  it('PUT /api/v1/user -> 413 Payload Too Large (Enforce 5MB limit in Multer FileInterceptor)', async () => {
    const oversizedBuffer = Buffer.alloc(MAX_AVATAR_FILE_SIZE_BYTES + 1024, 0);

    await request(app.getHttpServer())
      .put('/api/v1/user')
      .set('Authorization', `Bearer ${aliceToken}`)
      .attach('avatar', oversizedBuffer, {
        filename: 'oversized.png',
        contentType: 'image/png',
      })
      .expect(413);
  });

  it('PUT /api/v1/user -> 200 OK (Change password revokes ALL sessions including other devices and issues new valid token)', async () => {
    const device2LoginRes = await request(app.getHttpServer())
      .post('/api/v1/users/login')
      .send({
        user: {
          email: bob.email,
          password: bob.password,
        },
      })
      .expect(200);
    const bobDevice2Token: string = device2LoginRes.body.data.user.token;
    const bobDevice1Token = bobToken;

    const res = await request(app.getHttpServer())
      .put('/api/v1/user')
      .set('Authorization', `Bearer ${bobDevice1Token}`)
      .send({
        user: {
          password: 'NewSecretPassword@123',
        },
      })
      .expect(200);

    const newToken = res.body.data.user.token;
    expect(newToken).toBeDefined();
    expect(newToken).not.toBe(bobDevice1Token);
    expect(newToken).not.toBe(bobDevice2Token);
    bobToken = newToken;

    await request(app.getHttpServer())
      .get('/api/v1/user')
      .set('Authorization', `Bearer ${bobDevice1Token}`)
      .expect(401);

    await request(app.getHttpServer())
      .get('/api/v1/user')
      .set('Authorization', `Bearer ${bobDevice2Token}`)
      .expect(401);

    await request(app.getHttpServer())
      .get('/api/v1/user')
      .set('Authorization', `Bearer ${bobToken}`)
      .expect(200);
  });

  it('GET /api/v1/profiles/:username -> 200 OK (Get public profile without authentication)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/profiles/${alice.username}`)
      .expect(200);

    expect(res.body.data.profile.username).toBe(alice.username);
    expect(res.body.data.profile.following).toBe(false);
  });

  it('GET /api/v1/profiles/:username -> 404 Not Found (Non-existent user profile)', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/profiles/non_existent_user_999999')
      .expect(404);
  });

  it('POST /api/v1/profiles/:username/follow -> 200 OK (Follow another user)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/profiles/${bob.username}/follow`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(200);

    expect(res.body.data.profile.username).toBe(bob.username);
    expect(res.body.data.profile.following).toBe(true);

    const profileRes = await request(app.getHttpServer())
      .get(`/api/v1/profiles/${bob.username}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(200);

    expect(profileRes.body.data.profile.following).toBe(true);
  });

  it('POST /api/v1/profiles/:username/follow -> 400 Bad Request (Cannot follow yourself)', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/profiles/${alice.username}/follow`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(400);
  });

  it('DELETE /api/v1/profiles/:username/follow -> 200 OK (Unfollow user)', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/api/v1/profiles/${bob.username}/follow`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(200);

    expect(res.body.data.profile.username).toBe(bob.username);
    expect(res.body.data.profile.following).toBe(false);
  });

  it('DELETE /api/v1/profiles/:username/follow -> 400 Bad Request (Cannot unfollow yourself)', async () => {
    await request(app.getHttpServer())
      .delete(`/api/v1/profiles/${alice.username}/follow`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(400);
  });
});
