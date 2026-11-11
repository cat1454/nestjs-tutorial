import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { I18nService } from 'nestjs-i18n';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RedisService } from './redis.service.js';

describe('RedisService', () => {
  let redisService: RedisService;
  let configService: Partial<Record<keyof ConfigService, any>>;
  let i18nService: Partial<Record<keyof I18nService, any>>;
  let mockClient: any;

  beforeEach(() => {
    configService = {
      getOrThrow: vi.fn((key: string) => {
        if (key === 'redis.host') return 'localhost';
        if (key === 'redis.port') return 6379;
        return '';
      }),
    };

    i18nService = {
      t: vi.fn().mockImplementation(async (key: string) => key),
    };

    redisService = new RedisService(
      configService as ConfigService,
      i18nService as I18nService,
    );

    mockClient = {
      set: vi.fn(),
      get: vi.fn(),
      del: vi.fn(),
      exists: vi.fn(),
      quit: vi.fn(),
    };

    (redisService as any).client = mockClient;
  });

  it('should store key with blacklist prefix and TTL when adding to blacklist', async () => {
    mockClient.set.mockResolvedValue('OK');

    await redisService.addToBlacklist('jti-abc', 300);

    expect(mockClient.set).toHaveBeenCalledWith(
      'blacklist:jti-abc',
      'revoked',
      'EX',
      300,
    );
  });

  it('should check existence of blacklist:jti key', async () => {
    mockClient.exists.mockResolvedValue(1);

    const isRevoked = await redisService.isBlacklisted('jti-abc');

    expect(mockClient.exists).toHaveBeenCalledWith('blacklist:jti-abc');
    expect(isRevoked).toBe(true);
  });

  it('should throw ServiceUnavailableException (503) when Redis fails during exists check', async () => {
    mockClient.exists.mockRejectedValue(new Error('Connection refused'));

    await expect(redisService.isBlacklisted('jti-abc')).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('should throw ServiceUnavailableException (503) when Redis fails during set', async () => {
    mockClient.set.mockRejectedValue(new Error('Connection refused'));

    await expect(redisService.addToBlacklist('jti-abc', 300)).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});

