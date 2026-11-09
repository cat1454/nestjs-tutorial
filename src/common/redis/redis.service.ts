import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

interface MemoryEntry {
  value: string;
  expiresAt?: number;
}

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private readonly memoryStore = new Map<string, MemoryEntry>();

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const host = this.configService.get<string>('redis.host', 'localhost');
    const port = this.configService.get<number>('redis.port', 6379);

    if (process.env.NODE_ENV === 'test') {
      return;
    }

    try {
      this.client = new Redis({
        host,
        port,
        maxRetriesPerRequest: 1,
        retryStrategy: () => null,
        lazyConnect: true,
      });

      await this.client.connect();
      this.logger.log(`Connected to Redis at ${host}:${port}`);
    } catch {
      this.logger.warn(
        `Cannot connect to Redis at ${host}:${port}, using in-memory store`,
      );
      this.client = null;
    }
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit();
    }
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (this.client) {
      if (ttlSeconds && ttlSeconds > 0) {
        await this.client.set(key, value, 'EX', ttlSeconds);
      } else {
        await this.client.set(key, value);
      }
      return;
    }

    const expiresAt =
      ttlSeconds && ttlSeconds > 0
        ? Date.now() + ttlSeconds * 1000
        : undefined;
    this.memoryStore.set(key, { value, expiresAt });
  }

  async get(key: string): Promise<string | null> {
    if (this.client) {
      return this.client.get(key);
    }

    const entry = this.memoryStore.get(key);
    if (!entry) {
      return null;
    }

    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.memoryStore.delete(key);
      return null;
    }

    return entry.value;
  }

  async del(key: string): Promise<number> {
    if (this.client) {
      return this.client.del(key);
    }

    return this.memoryStore.delete(key) ? 1 : 0;
  }

  async exists(key: string): Promise<boolean> {
    if (this.client) {
      const result = await this.client.exists(key);
      return result === 1;
    }

    const val = await this.get(key);
    return val !== null;
  }

  async addToBlacklist(token: string, expirySeconds: number): Promise<void> {
    const key = `blacklist:${token}`;
    await this.set(key, 'revoked', Math.max(expirySeconds, 1));
  }

  async isBlacklisted(token: string): Promise<boolean> {
    const key = `blacklist:${token}`;
    return this.exists(key);
  }
}
