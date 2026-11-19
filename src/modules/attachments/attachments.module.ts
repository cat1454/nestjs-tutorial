import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AttachmentsService } from './attachments.service.js';
import { AttachmentEntity } from './entities/attachment.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([AttachmentEntity])],
  providers: [AttachmentsService],
  exports: [AttachmentsService],
})
export class AttachmentsModule {}

