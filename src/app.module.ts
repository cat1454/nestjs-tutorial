import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
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
    }),
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
        host: configService.get<string>('database.host', 'localhost'),
        port: configService.get<number>('database.port', 5432),
        username: configService.get<string>('database.username', 'postgres'),
        password: configService.get<string>('database.password', 'postgres'),
        database: configService.get<string>('database.name', 'sun_conduit_dev'),
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
