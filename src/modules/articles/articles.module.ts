import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard.js';
import { FollowEntity } from '../profiles/entities/follow.entity.js';
import { UsersModule } from '../users/users.module.js';
import { ArticlesController } from './articles.controller.js';
import { ArticlesService } from './articles.service.js';
import { ArticleEntity } from './entities/article.entity.js';
import { FavoriteEntity } from './entities/favorite.entity.js';
import { TagEntity } from './entities/tag.entity.js';
import { TagsController } from './tags.controller.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ArticleEntity,
      TagEntity,
      FavoriteEntity,
      FollowEntity,
    ]),
    UsersModule,
    JwtModule.register({}),
  ],
  controllers: [ArticlesController, TagsController],
  providers: [ArticlesService, JwtAuthGuard, OptionalJwtAuthGuard],
  exports: [ArticlesService],
})
export class ArticlesModule {}
