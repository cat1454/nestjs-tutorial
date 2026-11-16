import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AcceptLanguageResolver,
  HeaderResolver,
  I18nJsonLoader,
  I18nModule,
  QueryResolver,
} from 'nestjs-i18n';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { ArticlesModule } from './articles/articles.module.js';
import { RedisModule } from './common/redis/redis.module.js';
import configuration from './config/configuration.js';
import { validateEnv } from './config/env.validation.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { HelloModule } from './modules/hello/hello.module.js';
import { UserEntity } from './modules/users/entities/user.entity.js';
import { UsersModule } from './modules/users/users.module.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 20,
      },
    ]),
    I18nModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        fallbackLanguage: configService.get<string>('fallbackLanguage', 'en'),
        loader: I18nJsonLoader,
        loaderOptions: {
          path: path.join(__dirname, 'i18n'),
          watch: true,
        },
      }),
      resolvers: [
        new QueryResolver(['lang', 'l']),
        new HeaderResolver(['x-custom-lang']),
        new AcceptLanguageResolver(),
      ],
      inject: [ConfigService],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.getOrThrow<string>('database.host'),
        port: configService.getOrThrow<number>('database.port'),
        username: configService.getOrThrow<string>('database.username'),
        password: configService.getOrThrow<string>('database.password'),
        database: configService.getOrThrow<string>('database.name'),
        entities: [UserEntity],
        synchronize: false,
        autoLoadEntities: true,
        logging: configService.get<string>('nodeEnv') === 'development',
      }),
      inject: [ConfigService],
    }),
    RedisModule,
    UsersModule,
    AuthModule,
    HelloModule,
    ArticlesModule,
  ],
})
export class AppModule {}
