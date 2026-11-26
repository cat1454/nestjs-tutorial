import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test, TestingModule } from '@nestjs/testing';
import * as path from 'path';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module.js';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter.js';
import { TransformInterceptor } from '../../src/common/interceptors/transform.interceptor.js';

export interface TestAppContext {
  app: NestExpressApplication;
  dataSource: DataSource;
}

export async function createTestApp(): Promise<TestAppContext> {
  process.env.NODE_ENV = 'test';

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication<NestExpressApplication>();
  app.useStaticAssets(path.join(process.cwd(), 'public'), {
    prefix: '/public/',
  });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalInterceptors(new TransformInterceptor());
  app.useGlobalFilters(new HttpExceptionFilter());

  await app.init();
  app.getHttpServer().setMaxListeners(50);

  const dataSource = app.get(DataSource);
  return { app, dataSource };
}
