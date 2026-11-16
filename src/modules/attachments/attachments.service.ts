import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import { I18nContext, I18nService } from 'nestjs-i18n';
import * as path from 'path';
import { Repository } from 'typeorm';
import { DEFAULT_LANGUAGE } from '../auth/auth.constants.js';
import {
  ALLOWED_AVATAR_MIME_TYPES,
  AttachmentTargetType,
  MAX_AVATAR_FILE_SIZE_BYTES,
  PUBLIC_AVATARS_SUBDIR,
  PUBLIC_AVATARS_URL_PREFIX,
} from './attachments.constants.js';
import { AttachmentEntity } from './entities/attachment.entity.js';

export class UploadedFilePayload {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Injectable()
export class AttachmentsService {
  constructor(
    @InjectRepository(AttachmentEntity)
    private readonly attachmentRepository: Repository<AttachmentEntity>,
    private readonly i18n: I18nService,
  ) {}

  private get lang(): string {
    return I18nContext.current()?.lang ?? DEFAULT_LANGUAGE;
  }

  async uploadAvatar(
    targetId: string,
    file: UploadedFilePayload,
    targetType: AttachmentTargetType = AttachmentTargetType.USER,
  ): Promise<AttachmentEntity> {
    await this.validateFile(file);

    const uploadDir = path.resolve(process.cwd(), PUBLIC_AVATARS_SUBDIR);
    await fs.mkdir(uploadDir, { recursive: true });

    const ext = this.resolveExtension(file.originalname, file.mimetype);
    const storedFileName = `${randomUUID()}${ext}`;
    const absoluteFilePath = path.join(uploadDir, storedFileName);
    const publicUrl = `${PUBLIC_AVATARS_URL_PREFIX}/${storedFileName}`;

    await fs.writeFile(absoluteFilePath, file.buffer);

    const existingAttachments = await this.attachmentRepository.find({
      where: { targetType, targetId },
    });

    const attachment = this.attachmentRepository.create({
      targetType,
      targetId,
      url: publicUrl,
      fileName: path.basename(file.originalname),
      fileType: file.mimetype,
      fileSize: file.size,
    });

    const savedAttachment = await this.attachmentRepository.save(attachment);

    if (existingAttachments.length > 0) {
      await this.removeOldAttachments(existingAttachments);
    }

    return savedAttachment;
  }

  private async validateFile(file: UploadedFilePayload): Promise<void> {
    if (!file || !file.buffer || file.size <= 0) {
      const message = await this.i18n.t('errors.invalid_file', {
        lang: this.lang,
      });
      throw new BadRequestException(message);
    }

    if (!ALLOWED_AVATAR_MIME_TYPES.includes(file.mimetype)) {
      const message = await this.i18n.t('errors.invalid_file_type', {
        lang: this.lang,
      });
      throw new BadRequestException(message);
    }

    if (file.size > MAX_AVATAR_FILE_SIZE_BYTES) {
      const message = await this.i18n.t('errors.file_too_large', {
        lang: this.lang,
      });
      throw new BadRequestException(message);
    }
  }

  private resolveExtension(originalName: string, mimeType: string): string {
    const ext = path.extname(originalName).toLowerCase();
    if (ext && /^\.[a-z0-9]+$/.test(ext)) {
      return ext;
    }

    switch (mimeType) {
      case 'image/png':
        return '.png';
      case 'image/webp':
        return '.webp';
      case 'image/gif':
        return '.gif';
      default:
        return '.jpg';
    }
  }

  private async removeOldAttachments(
    attachments: AttachmentEntity[],
  ): Promise<void> {
    for (const old of attachments) {
      const relativePath = old.url.replace(/^\//, '');
      const fullPath = path.resolve(process.cwd(), relativePath);
      try {
        await fs.unlink(fullPath);
      } catch {
        // Ignore if file already missing on disk
      }
    }

    const ids = attachments.map((item) => item.id);
    await this.attachmentRepository.delete(ids);
  }
}
