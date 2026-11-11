import {
  ExecutionContext,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { I18nService } from 'nestjs-i18n';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RedisService } from '../redis/redis.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let jwtService: Partial<Record<keyof JwtService, any>>;
  let redisService: Partial<Record<keyof RedisService, any>>;
  let configService: Partial<Record<keyof ConfigService, any>>;
  let i18nService: Partial<Record<keyof I18nService, any>>;

  beforeEach(() => {
    jwtService = {
      verifyAsync: vi.fn(),
    };
    redisService = {
      isBlacklisted: vi.fn(),
    };
    configService = {
      getOrThrow: vi.fn().mockReturnValue('test-secret'),
    };
    i18nService = {
      t: vi.fn().mockImplementation(async (key: string) => key),
    };

    guard = new JwtAuthGuard(
      jwtService as JwtService,
      redisService as RedisService,
      configService as ConfigService,
      i18nService as I18nService,
    );
  });

  const createMockContext = (authHeader?: string) => {
    const request: any = {
      headers: {
        authorization: authHeader,
      },
    };

    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
  };

  it('should throw UnauthorizedException if authorization header is missing', async () => {
    const context = createMockContext();

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('should throw UnauthorizedException if JWT is invalid or expired', async () => {
    const context = createMockContext('Bearer expired-token');
    jwtService.verifyAsync!.mockRejectedValue(new Error('jwt expired'));

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('should throw UnauthorizedException if token jti is in Redis blacklist', async () => {
    const context = createMockContext('Bearer revoked-token');
    jwtService.verifyAsync!.mockResolvedValue({
      sub: 'user-id-123',
      email: 'john@example.com',
      username: 'john',
      jti: 'revoked-jti',
      exp: 9999999999,
    });
    redisService.isBlacklisted!.mockResolvedValue(true);

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(redisService.isBlacklisted).toHaveBeenCalledWith('revoked-jti');
  });

  it('should propagate ServiceUnavailableException (503) when Redis fails', async () => {
    const context = createMockContext('Bearer valid-token');
    jwtService.verifyAsync!.mockResolvedValue({
      sub: 'user-id-123',
      email: 'john@example.com',
      username: 'john',
      jti: 'jti-123',
      exp: 9999999999,
    });
    redisService.isBlacklisted!.mockRejectedValue(
      new ServiceUnavailableException('errors.redis_unavailable'),
    );

    await expect(guard.canActivate(context)).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('should allow access and attach user to request when token is valid and not blacklisted', async () => {
    const context = createMockContext('Bearer valid-token');
    redisService.isBlacklisted!.mockResolvedValue(false);
    jwtService.verifyAsync!.mockResolvedValue({
      sub: 'user-id-123',
      email: 'john@example.com',
      username: 'john',
      jti: 'jti-123',
      exp: 1900000000,
    });

    const canActivate = await guard.canActivate(context);
    expect(canActivate).toBe(true);

    const request = context.switchToHttp().getRequest();
    expect(request.user).toEqual({
      id: 'user-id-123',
      email: 'john@example.com',
      username: 'john',
      jti: 'jti-123',
      exp: 1900000000,
      token: 'valid-token',
    });
  });
});
