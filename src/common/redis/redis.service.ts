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

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis;

  constructor(
    private readonly configService: ConfigService,
    private readonly i18n: I18nService,
  ) {}

  async onModuleInit() {
    const host = this.configService.getOrThrow<string>('redis.host');
    const port = this.configService.getOrThrow<number>('redis.port');

    this.client = new Redis({
      host,
      port,
      maxRetriesPerRequest: 3,
      retryStrategy: (times: number) => Math.min(times * 100, 3000),
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
    const lang = I18nContext.current()?.lang;
    const message = await this.i18n.t('errors.redis_unavailable', { lang });
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

  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch {
      return await this.throwRedisUnavailable();
    }
  }

  async addToBlacklist(jti: string, expirySeconds: number): Promise<void> {
    const key = `blacklist:${jti}`;
    await this.set(key, 'revoked', expirySeconds);
  }

  async isBlacklisted(jti: string): Promise<boolean> {
    const key = `blacklist:${jti}`;
    return this.exists(key);
  }
}
