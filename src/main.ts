import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as path from 'path';
import { AppModule } from './app.module.js';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';
import { TransformInterceptor } from './common/interceptors/transform.interceptor.js';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('port', 3000);
  const apiPrefix = configService.get<string>('apiPrefix', 'api/v1');
  const swaggerPath = configService.get<string>('swaggerPath', 'api/docs');
  const appName = configService.get<string>('appName', 'Sun* Conduit API');

  app.useStaticAssets(path.join(process.cwd(), 'public'), {
    prefix: '/public/',
  });

  app.setGlobalPrefix(apiPrefix);
  app.enableCors();

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  app.useGlobalInterceptors(new TransformInterceptor());
  app.useGlobalFilters(new HttpExceptionFilter());

  const swaggerConfig = new DocumentBuilder()
    .setTitle(appName)
    .setDescription(
      'Hệ thống RESTful API theo đặc tả RealWorld (Conduit) được xây dựng trên nền tảng NestJS Framework - Dự án đào tạo kỹ thuật Sun* Asterisk.',
    )
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        description: 'Nhập JWT token để xác thực các API yêu cầu đăng nhập',
        in: 'header',
      },
      'JWT-auth',
    )
    .addTag('Hello', 'Kiểm tra sức khỏe hệ thống và đa ngôn ngữ i18n')
    .addTag(
      'Authentication',
      'Đăng ký, Đăng nhập, Đăng xuất (Redis Blacklist) & Current User',
    )
    .addTag('Users', 'Cập nhật thông tin cá nhân và tải lên Avatar (Attachments)')
    .addTag('Profiles', 'Quản lý thông tin hồ sơ người dùng, Follow và Unfollow')
    .addTag('Articles', 'CRUD Bài viết, Feed cá nhân, Yêu thích (Favorite) và Tags')
    .addTag('Comments', 'Bình luận trên bài viết')
    .addTag('Tags', 'Danh mục thẻ bài viết')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup(swaggerPath, app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'none',
      filter: true,
      showRequestDuration: true,
    },
    customSiteTitle: `${appName} - API Docs`,
  });

  await app.listen(port);
  logger.log(
    `Application "${appName}" is running on: http://localhost:${port}/${apiPrefix}`,
  );
  logger.log(
    `Swagger documentation is available at: http://localhost:${port}/${swaggerPath}`,
  );
}

await bootstrap();
