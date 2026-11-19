import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import { I18nContext, I18nService } from 'nestjs-i18n';
import * as path from 'path';
import { EntityManager } from 'typeorm';
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

export interface PreparedAvatarFile {
  absoluteFilePath: string;
  publicUrl: string;
  originalFileName: string;
  verifiedMimeType: string;
  fileSize: number;
}

interface VerifiedImageFormat {
  mimeType: string;
  extension: string;
}

const PNG_MAGIC_BYTES = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_MAGIC_BYTES = [0xff, 0xd8, 0xff];
const GIF87A_MAGIC = 'GIF87a';
const GIF89A_MAGIC = 'GIF89a';
const WEBP_RIFF_MAGIC = 'RIFF';
const WEBP_FORMAT_MAGIC = 'WEBP';
const MIN_WEBP_BYTES = 12;

@Injectable()
export class AttachmentsService {
  constructor(private readonly i18n: I18nService) {}

  private get lang(): string {
    return I18nContext.current()?.lang ?? DEFAULT_LANGUAGE;
  }

  async prepareAvatarUpload(
    file: UploadedFilePayload,
  ): Promise<PreparedAvatarFile> {
    const verifiedFormat = await this.validateAndDetectImageFormat(file);

    const uploadDir = path.resolve(process.cwd(), PUBLIC_AVATARS_SUBDIR);
    await fs.mkdir(uploadDir, { recursive: true });

    const storedFileName = `${randomUUID()}${verifiedFormat.extension}`;
    const absoluteFilePath = path.join(uploadDir, storedFileName);
    const publicUrl = `${PUBLIC_AVATARS_URL_PREFIX}/${storedFileName}`;

    await fs.writeFile(absoluteFilePath, file.buffer);

    return {
      absoluteFilePath,
      publicUrl,
      originalFileName: path.basename(file.originalname),
      verifiedMimeType: verifiedFormat.mimeType,
      fileSize: file.size,
    };
  }

  async replaceAttachmentInTransaction(
    manager: EntityManager,
    targetId: string,
    preparedFile: PreparedAvatarFile,
    targetType: AttachmentTargetType = AttachmentTargetType.USER,
  ): Promise<{ savedAttachment: AttachmentEntity; oldFileUrls: string[] }> {
    const existingAttachments = await manager.find(AttachmentEntity, {
      where: { targetType, targetId },
    });

    if (existingAttachments.length > 0) {
      const oldIds = existingAttachments.map((item) => item.id);
      await manager.delete(AttachmentEntity, oldIds);
    }

    const newAttachment = manager.create(AttachmentEntity, {
      targetType,
      targetId,
      url: preparedFile.publicUrl,
      fileName: preparedFile.originalFileName,
      fileType: preparedFile.verifiedMimeType,
      fileSize: preparedFile.fileSize,
    });

    const savedAttachment = await manager.save(AttachmentEntity, newAttachment);
    const oldFileUrls = existingAttachments.map((item) => item.url);

    return { savedAttachment, oldFileUrls };
  }

  async deleteFileByAbsolutePath(absoluteFilePath: string): Promise<void> {
    try {
      await fs.unlink(absoluteFilePath);
    } catch {
      // Ignore if file already removed on disk
    }
  }

  async deleteFilesByPublicUrls(publicUrls: string[]): Promise<void> {
    for (const publicUrl of publicUrls) {
      const relativePath = publicUrl.replace(/^\//, '');
      const fullPath = path.resolve(process.cwd(), relativePath);
      await this.deleteFileByAbsolutePath(fullPath);
    }
  }

  private async validateAndDetectImageFormat(
    file: UploadedFilePayload,
  ): Promise<VerifiedImageFormat> {
    if (!file || !file.buffer || file.size <= 0) {
      const message = await this.i18n.t('errors.invalid_file', {
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

    if (!ALLOWED_AVATAR_MIME_TYPES.includes(file.mimetype)) {
      const message = await this.i18n.t('errors.invalid_file_type', {
        lang: this.lang,
      });
      throw new BadRequestException(message);
    }

    const detectedFormat = this.detectImageFormatFromBuffer(file.buffer);
    if (!detectedFormat) {
      const message = await this.i18n.t('errors.invalid_file_type', {
        lang: this.lang,
      });
      throw new BadRequestException(message);
    }

    return detectedFormat;
  }

  private detectImageFormatFromBuffer(
    buffer: Buffer,
  ): VerifiedImageFormat | null {
    if (
      buffer.length >= PNG_MAGIC_BYTES.length &&
      PNG_MAGIC_BYTES.every((byte, idx) => buffer[idx] === byte)
    ) {
      return { mimeType: 'image/png', extension: '.png' };
    }

    if (
      buffer.length >= JPEG_MAGIC_BYTES.length &&
      JPEG_MAGIC_BYTES.every((byte, idx) => buffer[idx] === byte)
    ) {
      return { mimeType: 'image/jpeg', extension: '.jpg' };
    }

    if (buffer.length >= GIF87A_MAGIC.length) {
      const gifHeader = buffer.subarray(0, 6).toString('ascii');
      if (gifHeader === GIF87A_MAGIC || gifHeader === GIF89A_MAGIC) {
        return { mimeType: 'image/gif', extension: '.gif' };
      }
    }

    if (buffer.length >= MIN_WEBP_BYTES) {
      const riffHeader = buffer.subarray(0, 4).toString('ascii');
      const webpHeader = buffer.subarray(8, 12).toString('ascii');
      if (riffHeader === WEBP_RIFF_MAGIC && webpHeader === WEBP_FORMAT_MAGIC) {
        return { mimeType: 'image/webp', extension: '.webp' };
      }
    }

    return null;
  }
}
