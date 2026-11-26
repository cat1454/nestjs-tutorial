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

  it('should acquire distributed lock atomically with NX and EX', async () => {
    mockClient.set.mockResolvedValue('OK');

    const acquired = await redisService.acquireLock('cron:lock:test', 3600);

    expect(acquired).toBe(true);
    expect(mockClient.set).toHaveBeenCalledWith(
      'cron:lock:test',
      'locked',
      'EX',
      3600,
      'NX',
    );
  });

  it('should return false when lock is already held or Redis errors', async () => {
    mockClient.set.mockResolvedValueOnce(null);
    expect(await redisService.acquireLock('cron:lock:test', 3600)).toBe(false);

    mockClient.set.mockRejectedValueOnce(new Error('Connection refused'));
    expect(await redisService.acquireLock('cron:lock:test', 3600)).toBe(false);
  });

  it('should set without TTL, get values, handle get errors, and manage user revoked timestamps', async () => {
    mockClient.set.mockResolvedValue('OK');
    await redisService.set('plain-key', 'val');
    expect(mockClient.set).toHaveBeenCalledWith('plain-key', 'val');

    mockClient.get.mockResolvedValueOnce('1700000000000');
    expect(await redisService.getUserRevokedBefore('u1')).toBe(1700000000000);

    mockClient.get.mockResolvedValueOnce(null);
    expect(await redisService.getUserRevokedBefore('u1')).toBeNull();

    mockClient.get.mockResolvedValueOnce('not-a-number');
    expect(await redisService.getUserRevokedBefore('u1')).toBeNull();

    await redisService.setUserRevokedBefore('u1', 1700000000000, 600);
    expect(mockClient.set).toHaveBeenCalledWith(
      'user:revoked_before:u1',
      '1700000000000',
      'EX',
      600,
    );

    mockClient.get.mockRejectedValueOnce(new Error('Redis down'));
    await expect(redisService.get('any-key')).rejects.toThrow(
      ServiceUnavailableException,
    );

    await redisService.onModuleDestroy();
    expect(mockClient.quit).toHaveBeenCalled();
  });
});

