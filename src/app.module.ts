import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  AcceptLanguageResolver,
  HeaderResolver,
  I18nJsonLoader,
  I18nModule,
  QueryResolver,
} from 'nestjs-i18n';
import * as path from 'path';
import { fileURLToPath } from 'url';
import configuration from './config/configuration.js';
import { HelloModule } from './modules/hello/hello.module.js';

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
    HelloModule,
  ],
})
export class AppModule {}
