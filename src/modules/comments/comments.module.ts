import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard.js';
import { ArticleEntity } from '../articles/entities/article.entity.js';
import { MailModule } from '../mail/mail.module.js';
import { FollowEntity } from '../profiles/entities/follow.entity.js';
import { CommentsController } from './comments.controller.js';
import { CommentsService } from './comments.service.js';
import { CommentEntity } from './entities/comment.entity.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([CommentEntity, ArticleEntity, FollowEntity]),
    JwtModule.register({}),
    MailModule,
  ],
  controllers: [CommentsController],
  providers: [CommentsService, JwtAuthGuard, OptionalJwtAuthGuard],
  exports: [CommentsService],
})
export class CommentsModule {}
