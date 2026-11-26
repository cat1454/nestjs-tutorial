import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { validateEnv } from './env.validation.js';

describe('validateEnv', () => {
  const validEnv = {
    NODE_ENV: 'test',
    PORT: '3000',
    JWT_SECRET: 'super-secret',
    DB_HOST: 'localhost',
    DB_PORT: '5432',
    DB_USERNAME: 'postgres',
    DB_PASSWORD: 'postgres',
    DB_NAME: 'sun_conduit_dev',
    REDIS_HOST: 'localhost',
    REDIS_PORT: '6379',
  };

  it('validates and coerces valid environment variables', () => {
    const validated = validateEnv(validEnv);
    expect(validated.PORT).toBe(3000);
    expect(validated.DB_PORT).toBe(5432);
    expect(validated.REDIS_PORT).toBe(6379);
    expect(validated.JWT_EXPIRES_IN).toBe('7d');
  });

  it('throws when required variables are missing or ports are invalid', () => {
    expect(() => validateEnv({})).toThrow();
    expect(() =>
      validateEnv({ ...validEnv, DB_PORT: '99999' }),
    ).toThrow();
    expect(() =>
      validateEnv({ ...validEnv, NODE_ENV: 'staging' }),
    ).toThrow();
  });
});
