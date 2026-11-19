import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { I18nService } from 'nestjs-i18n';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserEntity } from '../../modules/users/entities/user.entity.js';
import { RedisService } from '../redis/redis.service.js';
import { TokenService } from './token.service.js';

describe('TokenService', () => {
  let tokenService: TokenService;
  let jwtService: Partial<Record<keyof JwtService, any>>;
  let configService: Partial<Record<keyof ConfigService, any>>;
  let redisService: Partial<Record<keyof RedisService, any>>;
  let i18nService: Partial<Record<keyof I18nService, any>>;

  const mockUser: UserEntity = {
    id: 'user-uuid-1',
    username: 'sunner',
    email: 'sunner@example.com',
    password: 'hashed-password',
    bio: 'Hello',
    image: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    jwtService = {
      signAsync: vi.fn().mockResolvedValue('signed-jwt-token'),
      decode: vi.fn(),
    };

    configService = {
      getOrThrow: vi.fn((key: string) => {
        if (key === 'jwt.secret') return 'test-secret';
        if (key === 'jwt.expiresIn') return '7d';
        return '';
      }),
    };

    redisService = {
      addToBlacklist: vi.fn().mockResolvedValue(undefined),
      setUserRevokedBefore: vi.fn().mockResolvedValue(undefined),
    };

    i18nService = {
      t: vi.fn().mockImplementation(async (key: string) => key),
    };

    tokenService = new TokenService(
      jwtService as JwtService,
      configService as ConfigService,
      redisService as RedisService,
      i18nService as I18nService,
    );
  });

  it('should generate JWT with jti and iatMs', async () => {
    const token = await tokenService.generateToken(mockUser, 9999999999999);

    expect(token).toBe('signed-jwt-token');
    expect(jwtService.signAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        sub: 'user-uuid-1',
        email: 'sunner@example.com',
        username: 'sunner',
        jti: expect.any(String),
        iatMs: 9999999999999,
      }),
      { secret: 'test-secret', expiresIn: '7d' },
    );
  });

  it('should revoke single token jti in Redis with remaining TTL', async () => {
    const futureExp = Math.floor(Date.now() / 1000) + 1800;

    await tokenService.revokeToken({
      id: 'user-uuid-1',
      email: 'sunner@example.com',
      username: 'sunner',
      jti: 'jti-1',
      exp: futureExp,
      token: 'sample-token',
    });

    expect(redisService.addToBlacklist).toHaveBeenCalledWith(
      'jti-1',
      expect.any(Number),
    );
  });

  it('should throw BadRequestException if token has no exp claim during revocation', async () => {
    jwtService.decode!.mockReturnValue(null);

    await expect(
      tokenService.revokeToken({
        id: 'user-uuid-1',
        email: 'sunner@example.com',
        username: 'sunner',
        token: 'invalid-token',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should revoke all user tokens by setting user:revoked_before timestamp with parsed 7d TTL', async () => {
    const futureExp = Math.floor(Date.now() / 1000) + 1800;

    const revokedAtMs = await tokenService.revokeAllUserTokens('user-uuid-1', {
      id: 'user-uuid-1',
      email: 'sunner@example.com',
      username: 'sunner',
      jti: 'current-jti',
      exp: futureExp,
      token: 'current-token',
    });

    expect(typeof revokedAtMs).toBe('number');
    expect(redisService.setUserRevokedBefore).toHaveBeenCalledWith(
      'user-uuid-1',
      revokedAtMs,
      7 * 24 * 60 * 60,
    );
    expect(redisService.addToBlacklist).toHaveBeenCalledWith(
      'current-jti',
      expect.any(Number),
    );
  });

  it('should build AuthResponseDto consistently', () => {
    const response = tokenService.buildAuthResponse(mockUser, 'my-token');
    expect(response).toEqual({
      user: {
        email: 'sunner@example.com',
        token: 'my-token',
        username: 'sunner',
        bio: 'Hello',
        image: null,
      },
    });
  });
});
