import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { I18nService } from 'nestjs-i18n';
import { Repository } from 'typeorm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AttachmentTargetType,
  MAX_AVATAR_FILE_SIZE_BYTES,
} from './attachments.constants.js';
import { AttachmentsService } from './attachments.service.js';
import { AttachmentEntity } from './entities/attachment.entity.js';

describe('AttachmentsService', () => {
  let attachmentsService: AttachmentsService;
  let attachmentRepository: Partial<
    Record<keyof Repository<AttachmentEntity>, any>
  >;
  let i18nService: Partial<Record<keyof I18nService, any>>;

  beforeEach(async () => {
    attachmentRepository = {
      find: vi.fn().mockResolvedValue([]),
      create: vi.fn((data) => ({ id: 'att-uuid-123', ...data })),
      save: vi.fn((entity) => Promise.resolve(entity)),
      delete: vi.fn().mockResolvedValue({ affected: 1 }),
    };

    i18nService = {
      t: vi.fn().mockImplementation(async (key: string) => key),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttachmentsService,
        {
          provide: getRepositoryToken(AttachmentEntity),
          useValue: attachmentRepository,
        },
        { provide: I18nService, useValue: i18nService },
      ],
    }).compile();

    attachmentsService = module.get<AttachmentsService>(AttachmentsService);
  });

  it('should save valid image file and create polymorphic AttachmentEntity record', async () => {
    const file = {
      originalname: 'my-avatar.png',
      mimetype: 'image/png',
      size: 256,
      buffer: Buffer.from('png-binary-content'),
    };

    const result = await attachmentsService.uploadAvatar(
      'user-uuid-1',
      file,
      AttachmentTargetType.USER,
    );

    expect(result.targetType).toBe(AttachmentTargetType.USER);
    expect(result.targetId).toBe('user-uuid-1');
    expect(result.fileName).toBe('my-avatar.png');
    expect(result.fileType).toBe('image/png');
    expect(result.fileSize).toBe(256);
    expect(result.url).toMatch(/^\/public\/uploads\/avatars\/[0-9a-f-]+\.png$/);
  });

  it('should throw BadRequestException for unsupported MIME types', async () => {
    const file = {
      originalname: 'script.sh',
      mimetype: 'text/plain',
      size: 128,
      buffer: Buffer.from('echo hello'),
    };

    await expect(
      attachmentsService.uploadAvatar('user-uuid-1', file),
    ).rejects.toThrow(BadRequestException);
  });

  it('should throw BadRequestException when file size exceeds 5MB', async () => {
    const file = {
      originalname: 'huge.png',
      mimetype: 'image/png',
      size: MAX_AVATAR_FILE_SIZE_BYTES + 1,
      buffer: Buffer.from('tiny-buffer-representing-large-size'),
    };

    await expect(
      attachmentsService.uploadAvatar('user-uuid-1', file),
    ).rejects.toThrow(BadRequestException);
  });
});

