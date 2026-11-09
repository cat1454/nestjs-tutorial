import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { RedisService } from '../redis/redis.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let jwtService: Partial<Record<keyof JwtService, any>>;
  let redisService: Partial<Record<keyof RedisService, any>>;
  let configService: Partial<Record<keyof ConfigService, any>>;

  beforeEach(() => {
    jwtService = {
      verifyAsync: vi.fn(),
    };
    redisService = {
      isBlacklisted: vi.fn(),
    };
    configService = {
      get: vi.fn((key: string, defaultValue: any) => defaultValue),
    };

    guard = new JwtAuthGuard(
      jwtService as JwtService,
      redisService as RedisService,
      configService as ConfigService,
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

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException if token is in Redis blacklist', async () => {
    const context = createMockContext('Bearer revoked-token');
    redisService.isBlacklisted!.mockResolvedValue(true);

    await expect(guard.canActivate(context)).rejects.toThrow('Token has been revoked');
  });

  it('should throw UnauthorizedException if JWT is invalid or expired', async () => {
    const context = createMockContext('Bearer expired-token');
    redisService.isBlacklisted!.mockResolvedValue(false);
    jwtService.verifyAsync!.mockRejectedValue(new Error('jwt expired'));

    await expect(guard.canActivate(context)).rejects.toThrow('Invalid or expired token');
  });

  it('should allow access and attach user to request when token is valid and not blacklisted', async () => {
    const context = createMockContext('Bearer valid-token');
    redisService.isBlacklisted!.mockResolvedValue(false);
    jwtService.verifyAsync!.mockResolvedValue({
      sub: 'user-id-123',
      email: 'john@example.com',
      username: 'john',
    });

    const canActivate = await guard.canActivate(context);
    expect(canActivate).toBe(true);

    const request = context.switchToHttp().getRequest();
    expect(request.user).toEqual({
      id: 'user-id-123',
      email: 'john@example.com',
      username: 'john',
      token: 'valid-token',
    });
  });
});

