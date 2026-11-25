import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ArticleEntity } from '../articles/entities/article.entity.js';
import { AttachmentEntity } from '../attachments/entities/attachment.entity.js';
import { MailModule } from '../mail/mail.module.js';
import { UserEntity } from '../users/entities/user.entity.js';
import { TasksService } from './tasks.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([ArticleEntity, UserEntity, AttachmentEntity]),
    MailModule,
  ],
  providers: [TasksService],
  exports: [TasksService],
})
export class TasksModule {}
