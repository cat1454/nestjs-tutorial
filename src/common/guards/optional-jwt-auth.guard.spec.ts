import { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { I18nService } from 'nestjs-i18n';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RedisService } from '../redis/redis.service.js';
import { OptionalJwtAuthGuard } from './optional-jwt-auth.guard.js';

describe('OptionalJwtAuthGuard', () => {
  let guard: OptionalJwtAuthGuard;
  let jwtService: { verifyAsync: ReturnType<typeof vi.fn> };
  let redisService: {
    isBlacklisted: ReturnType<typeof vi.fn>;
    getUserRevokedBefore: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    jwtService = {
      verifyAsync: vi.fn().mockResolvedValue({
        sub: 'u-1',
        email: 'a@b.com',
        username: 'alice',
        jti: 'jti-1',
      }),
    };
    redisService = {
      isBlacklisted: vi.fn().mockResolvedValue(false),
      getUserRevokedBefore: vi.fn().mockResolvedValue(null),
    };
    const configService = {
      getOrThrow: vi.fn().mockReturnValue('secret'),
    } as unknown as ConfigService;
    const i18nService = {
      t: vi.fn().mockResolvedValue('err'),
    } as unknown as I18nService;

    guard = new OptionalJwtAuthGuard(
      jwtService as unknown as JwtService,
      redisService as unknown as RedisService,
      configService,
      i18nService,
    );
  });

  it('returns true immediately when authorization header is absent', async () => {
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({ headers: {} }),
      }),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(jwtService.verifyAsync).not.toHaveBeenCalled();
  });

  it('delegates to JwtAuthGuard when authorization header is present', async () => {
    const request: any = { headers: { authorization: 'Bearer valid-token' } };
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(jwtService.verifyAsync).toHaveBeenCalledWith('valid-token', {
      secret: 'secret',
    });
    expect(request.user.id).toBe('u-1');
  });
});
