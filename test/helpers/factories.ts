import { faker } from '@faker-js/faker';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';

export interface RegisterCredentials {
  username: string;
  email: string;
  password: string;
}

export interface ArticlePayload {
  title: string;
  description: string;
  body: string;
  tagList?: string[];
}

export interface CommentPayload {
  body: string;
}

export function buildRegisterPayload(
  overrides: Partial<RegisterCredentials> = {},
): RegisterCredentials {
  const suffix = faker.string.alphanumeric({ length: 6, casing: 'lower' });
  const baseUser = faker.internet
    .username()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 14);

  return {
    username: overrides.username ?? `${baseUser || 'user'}_${suffix}`,
    email:
      overrides.email ??
      `${baseUser || 'user'}_${suffix}@example.com`.toLowerCase(),
    password: overrides.password ?? 'Password@123',
  };
}

export function buildArticlePayload(
  overrides: Partial<ArticlePayload> = {},
): ArticlePayload {
  return {
    title: overrides.title ?? faker.lorem.sentence({ min: 3, max: 6 }),
    description: overrides.description ?? faker.lorem.sentence({ min: 6, max: 12 }),
    body: overrides.body ?? faker.lorem.paragraphs(2),
    ...(overrides.tagList !== undefined
      ? { tagList: overrides.tagList }
      : {
          tagList: [
            faker.word.noun().toLowerCase(),
            faker.word.adjective().toLowerCase(),
          ],
        }),
  };
}

export function buildCommentPayload(
  overrides: Partial<CommentPayload> = {},
): CommentPayload {
  return {
    body: overrides.body ?? faker.lorem.sentence({ min: 4, max: 12 }),
  };
}

export async function registerUser(
  app: INestApplication,
  overrides: Partial<RegisterCredentials> = {},
): Promise<{
  credentials: RegisterCredentials;
  token: string;
  user: Record<string, any>;
}> {
  const credentials = buildRegisterPayload(overrides);
  const res = await request(app.getHttpServer())
    .post('/api/v1/users')
    .send({ user: credentials })
    .expect(201);

  return {
    credentials,
    token: res.body.data.user.token as string,
    user: res.body.data.user as Record<string, any>,
  };
}

export async function createArticle(
  app: INestApplication,
  token: string,
  overrides: Partial<ArticlePayload> = {},
): Promise<Record<string, any>> {
  const payload = buildArticlePayload(overrides);
  const res = await request(app.getHttpServer())
    .post('/api/v1/articles')
    .set('Authorization', `Bearer ${token}`)
    .send({ article: payload })
    .expect(201);

  return res.body.data.article as Record<string, any>;
}

export async function createComment(
  app: INestApplication,
  token: string,
  slug: string,
  overrides: Partial<CommentPayload> = {},
): Promise<Record<string, any>> {
  const payload = buildCommentPayload(overrides);
  const res = await request(app.getHttpServer())
    .post(`/api/v1/articles/${slug}/comments`)
    .set('Authorization', `Bearer ${token}`)
    .send({ comment: payload })
    .expect(201);

  return res.body.data.comment as Record<string, any>;
}
