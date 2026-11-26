import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { I18nService } from 'nestjs-i18n';
import { EntityManager } from 'typeorm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AttachmentTargetType,
  MAX_AVATAR_FILE_SIZE_BYTES,
} from './attachments.constants.js';
import { AttachmentsService } from './attachments.service.js';
import { AttachmentEntity } from './entities/attachment.entity.js';

const VALID_PNG_BUFFER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

describe('AttachmentsService', () => {
  let attachmentsService: AttachmentsService;
  let i18nService: Partial<Record<keyof I18nService, any>>;

  beforeEach(async () => {
    i18nService = {
      t: vi.fn().mockImplementation(async (key: string) => key),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttachmentsService,
        { provide: I18nService, useValue: i18nService },
      ],
    }).compile();

    attachmentsService = module.get<AttachmentsService>(AttachmentsService);
  });

  it('should verify PNG magic bytes and force .png extension even if original filename is .html', async () => {
    const file = {
      originalname: 'avatar.html',
      mimetype: 'image/png',
      size: VALID_PNG_BUFFER.length,
      buffer: VALID_PNG_BUFFER,
    };

    const prepared = await attachmentsService.prepareAvatarUpload(file);

    expect(prepared.verifiedMimeType).toBe('image/png');
    expect(prepared.publicUrl).toMatch(
      /^\/public\/uploads\/avatars\/[0-9a-f-]+\.png$/,
    );

    await attachmentsService.deleteFileByAbsolutePath(
      prepared.absoluteFilePath,
    );
  });

  it('should reject HTML file spoofed as image/png (Stored XSS protection)', async () => {
    const htmlBuffer = Buffer.from('<script>alert(1)</script>');
    const file = {
      originalname: 'avatar.html',
      mimetype: 'image/png',
      size: htmlBuffer.length,
      buffer: htmlBuffer,
    };

    await expect(
      attachmentsService.prepareAvatarUpload(file),
    ).rejects.toThrow(BadRequestException);
  });

  it('should throw BadRequestException for unsupported MIME types', async () => {
    const file = {
      originalname: 'script.sh',
      mimetype: 'text/plain',
      size: 128,
      buffer: Buffer.from('echo hello'),
    };

    await expect(
      attachmentsService.prepareAvatarUpload(file),
    ).rejects.toThrow(BadRequestException);
  });

  it('should throw BadRequestException when file size exceeds 5MB', async () => {
    const file = {
      originalname: 'huge.png',
      mimetype: 'image/png',
      size: MAX_AVATAR_FILE_SIZE_BYTES + 1,
      buffer: VALID_PNG_BUFFER,
    };

    await expect(
      attachmentsService.prepareAvatarUpload(file),
    ).rejects.toThrow(BadRequestException);
  });

  it('should replace old attachment inside transaction manager and return old URLs without deleting files yet', async () => {
    const mockManager = {
      find: vi.fn().mockResolvedValue([
        { id: 'old-att-id', url: '/public/uploads/avatars/old.png' },
      ]),
      delete: vi.fn().mockResolvedValue({ affected: 1 }),
      create: vi.fn((_entity, data) => ({ id: 'new-att-id', ...data })),
      save: vi.fn((_entity, data) => Promise.resolve(data)),
    } as unknown as EntityManager;

    const result = await attachmentsService.replaceAttachmentInTransaction(
      mockManager,
      'user-uuid-1',
      {
        absoluteFilePath: '/tmp/new.png',
        publicUrl: '/public/uploads/avatars/new.png',
        originalFileName: 'avatar.png',
        verifiedMimeType: 'image/png',
        fileSize: 128,
      },
      AttachmentTargetType.USER,
    );

    expect(mockManager.delete).toHaveBeenCalledWith(AttachmentEntity, [
      'old-att-id',
    ]);
    expect(result.savedAttachment.url).toBe('/public/uploads/avatars/new.png');
    expect(result.oldFileUrls).toEqual(['/public/uploads/avatars/old.png']);
  });

  it('should detect JPEG, GIF, and WebP magic bytes, reject empty files, and ignore missing files on delete', async () => {
    await expect(
      attachmentsService.prepareAvatarUpload({
        originalname: 'empty.png',
        mimetype: 'image/png',
        size: 0,
        buffer: Buffer.alloc(0),
      }),
    ).rejects.toThrow(BadRequestException);

    const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const jpeg = await attachmentsService.prepareAvatarUpload({
      originalname: 'photo.jpg',
      mimetype: 'image/jpeg',
      size: jpegBuffer.length,
      buffer: jpegBuffer,
    });
    expect(jpeg.verifiedMimeType).toBe('image/jpeg');

    const gifBuffer = Buffer.from('GIF89a\x01\x00\x01\x00', 'ascii');
    const gif = await attachmentsService.prepareAvatarUpload({
      originalname: 'anim.gif',
      mimetype: 'image/gif',
      size: gifBuffer.length,
      buffer: gifBuffer,
    });
    expect(gif.verifiedMimeType).toBe('image/gif');

    const webpBuffer = Buffer.from('RIFF\x00\x00\x00\x00WEBP', 'ascii');
    const webp = await attachmentsService.prepareAvatarUpload({
      originalname: 'pic.webp',
      mimetype: 'image/webp',
      size: webpBuffer.length,
      buffer: webpBuffer,
    });
    expect(webp.verifiedMimeType).toBe('image/webp');

    await attachmentsService.deleteFilesByPublicUrls([
      jpeg.publicUrl,
      gif.publicUrl,
      webp.publicUrl,
      '/public/uploads/avatars/does-not-exist.png',
    ]);
  });
});
