import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { I18nContext, I18nService } from 'nestjs-i18n';
import { DEFAULT_LANGUAGE } from '../../modules/auth/auth.constants.js';

const REDIS_MAX_RETRIES = 3;
const REDIS_RETRY_DELAY_STEP_MS = 100;
const REDIS_MAX_RETRY_DELAY_MS = 3000;
const REDIS_BLACKLIST_PREFIX = 'blacklist:';
const REDIS_USER_REVOKED_PREFIX = 'user:revoked_before:';
const REDIS_REVOKED_VALUE = 'revoked';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis;

  constructor(
    private readonly configService: ConfigService,
    private readonly i18n: I18nService,
  ) {}

  private get lang(): string {
    return I18nContext.current()?.lang ?? DEFAULT_LANGUAGE;
  }

  async onModuleInit() {
    const host = this.configService.getOrThrow<string>('redis.host');
    const port = this.configService.getOrThrow<number>('redis.port');

    this.client = new Redis({
      host,
      port,
      maxRetriesPerRequest: REDIS_MAX_RETRIES,
      retryStrategy: (times: number) =>
        Math.min(times * REDIS_RETRY_DELAY_STEP_MS, REDIS_MAX_RETRY_DELAY_MS),
      lazyConnect: true,
    });

    this.client.on('error', (err) => {
      this.logger.error(`Redis connection error: ${err.message}`);
    });

    try {
      await this.client.connect();
      this.logger.log(`Connected to Redis at ${host}:${port}`);
    } catch (err) {
      this.logger.error(
        `Initial Redis connection failed at ${host}:${port}: ${(err as Error).message}`,
      );
    }
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit();
    }
  }

  private async throwRedisUnavailable(): Promise<never> {
    const message = await this.i18n.t('errors.redis_unavailable', {
      lang: this.lang,
    });
    throw new ServiceUnavailableException(message);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    try {
      if (ttlSeconds && ttlSeconds > 0) {
        await this.client.set(key, value, 'EX', ttlSeconds);
      } else {
        await this.client.set(key, value);
      }
    } catch {
      await this.throwRedisUnavailable();
    }
  }

  async get(key: string): Promise<string | null> {
    try {
      return await this.client.get(key);
    } catch {
      return await this.throwRedisUnavailable();
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch {
      return await this.throwRedisUnavailable();
    }
  }

  async addToBlacklist(jti: string, expirySeconds: number): Promise<void> {
    const key = `${REDIS_BLACKLIST_PREFIX}${jti}`;
    await this.set(key, REDIS_REVOKED_VALUE, expirySeconds);
  }

  async isBlacklisted(jti: string): Promise<boolean> {
    const key = `${REDIS_BLACKLIST_PREFIX}${jti}`;
    return this.exists(key);
  }

  async setUserRevokedBefore(
    userId: string,
    timestampMs: number,
    ttlSeconds: number,
  ): Promise<void> {
    const key = `${REDIS_USER_REVOKED_PREFIX}${userId}`;
    await this.set(key, String(timestampMs), ttlSeconds);
  }

  async getUserRevokedBefore(userId: string): Promise<number | null> {
    const key = `${REDIS_USER_REVOKED_PREFIX}${userId}`;
    const value = await this.get(key);
    if (!value) {
      return null;
    }
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
}
