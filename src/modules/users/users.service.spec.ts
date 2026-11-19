import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { I18nService } from 'nestjs-i18n';
import { DataSource, Repository } from 'typeorm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TokenService } from '../../common/auth/token.service.js';
import { AttachmentTargetType } from '../attachments/attachments.constants.js';
import { AttachmentsService } from '../attachments/attachments.service.js';
import { PG_UNIQUE_VIOLATION_CODE } from '../auth/auth.constants.js';
import { UserEntity } from './entities/user.entity.js';
import { UsersService } from './users.service.js';

describe('UsersService', () => {
  let usersService: UsersService;
  let userRepository: Partial<Record<keyof Repository<UserEntity>, any>>;
  let mockManager: { save: any };
  let dataSource: Partial<Record<keyof DataSource, any>>;
  let attachmentsService: Partial<Record<keyof AttachmentsService, any>>;
  let tokenService: Partial<Record<keyof TokenService, any>>;
  let i18nService: Partial<Record<keyof I18nService, any>>;

  const mockUser: UserEntity = {
    id: 'user-uuid-1',
    username: 'sunner',
    email: 'sunner@example.com',
    password: 'hashed-password',
    bio: null,
    image: '/public/uploads/avatars/old.png',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    userRepository = {
      create: vi.fn((data) => data),
      save: vi.fn((entity) => Promise.resolve({ ...mockUser, ...entity })),
      findOne: vi.fn(),
      exists: vi.fn(),
    };

    mockManager = {
      save: vi.fn((_entity, data) => Promise.resolve({ ...mockUser, ...data })),
    };

    dataSource = {
      transaction: vi.fn(async (callback: (manager: any) => Promise<any>) =>
        callback(mockManager),
      ),
    };

    attachmentsService = {
      prepareAvatarUpload: vi.fn(),
      replaceAttachmentInTransaction: vi.fn(),
      deleteFileByAbsolutePath: vi.fn().mockResolvedValue(undefined),
      deleteFilesByPublicUrls: vi.fn().mockResolvedValue(undefined),
    };

    tokenService = {
      generateToken: vi.fn().mockResolvedValue('new-jwt-token'),
      revokeAllUserTokens: vi.fn().mockResolvedValue(1700000000000),
      buildAuthResponse: vi.fn((user: UserEntity, token: string) => ({
        user: {
          email: user.email,
          token,
          username: user.username,
          bio: user.bio,
          image: user.image,
        },
      })),
    };

    i18nService = {
      t: vi.fn().mockImplementation(async (key: string) => key),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(UserEntity), useValue: userRepository },
        { provide: DataSource, useValue: dataSource },
        { provide: AttachmentsService, useValue: attachmentsService },
        { provide: TokenService, useValue: tokenService },
        { provide: I18nService, useValue: i18nService },
      ],
    }).compile();

    usersService = module.get<UsersService>(UsersService);
  });

  it('should update bio and username inside transaction successfully', async () => {
    userRepository.findOne!.mockResolvedValue({ ...mockUser });
    userRepository.exists!.mockResolvedValue(false);

    const result = await usersService.updateCurrentUser(
      {
        id: 'user-uuid-1',
        email: 'sunner@example.com',
        username: 'sunner',
        token: 'existing-token',
      },
      {
        user: {
          username: 'sunner_updated',
          bio: 'Updated bio',
        },
      },
    );

    expect(result.user.username).toBe('sunner_updated');
    expect(result.user.bio).toBe('Updated bio');
    expect(result.user.token).toBe('new-jwt-token');
  });

  it('should revoke ALL user sessions via TokenService and issue strictly newer token when password is changed', async () => {
    userRepository.findOne!.mockResolvedValue({ ...mockUser });
    const currentUser = {
      id: 'user-uuid-1',
      email: 'sunner@example.com',
      username: 'sunner',
      jti: 'old-jti-123',
      exp: Math.floor(Date.now() / 1000) + 3600,
      token: 'old-token',
    };

    const result = await usersService.updateCurrentUser(currentUser, {
      user: {
        password: 'NewPassword@123',
      },
    });

    expect(tokenService.revokeAllUserTokens).toHaveBeenCalledWith(
      'user-uuid-1',
      currentUser,
    );
    expect(tokenService.generateToken).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'user-uuid-1' }),
      1700000000001,
    );
    expect(result.user.token).toBe('new-jwt-token');
  });

  it('should save attachment & user in the same transaction and delete old avatar file only AFTER commit', async () => {
    userRepository.findOne!.mockResolvedValue({ ...mockUser });
    const preparedFile = {
      absoluteFilePath: '/disk/new.png',
      publicUrl: '/public/uploads/avatars/new.png',
      originalFileName: 'avatar.png',
      verifiedMimeType: 'image/png',
      fileSize: 1024,
    };
    attachmentsService.prepareAvatarUpload!.mockResolvedValue(preparedFile);
    attachmentsService.replaceAttachmentInTransaction!.mockResolvedValue({
      savedAttachment: { id: 'att-new', url: preparedFile.publicUrl },
      oldFileUrls: ['/public/uploads/avatars/old.png'],
    });

    const fakeFile = {
      originalname: 'avatar.png',
      mimetype: 'image/png',
      size: 1024,
      buffer: Buffer.from('fake-image'),
    };

    const result = await usersService.updateCurrentUser(
      {
        id: 'user-uuid-1',
        email: 'sunner@example.com',
        username: 'sunner',
        token: 'existing-token',
      },
      {},
      fakeFile,
    );

    expect(
      attachmentsService.replaceAttachmentInTransaction,
    ).toHaveBeenCalledWith(
      mockManager,
      'user-uuid-1',
      preparedFile,
      AttachmentTargetType.USER,
    );
    expect(attachmentsService.deleteFilesByPublicUrls).toHaveBeenCalledWith([
      '/public/uploads/avatars/old.png',
    ]);
    expect(attachmentsService.deleteFileByAbsolutePath).not.toHaveBeenCalled();
    expect(result.user.image).toBe('/public/uploads/avatars/new.png');
  });

  it('should clean up newly uploaded file and preserve old avatar file when transaction fails (23505)', async () => {
    userRepository.findOne!.mockResolvedValue({ ...mockUser });
    userRepository.exists!.mockResolvedValue(false);

    const preparedFile = {
      absoluteFilePath: '/disk/orphan-new.png',
      publicUrl: '/public/uploads/avatars/orphan-new.png',
      originalFileName: 'avatar.png',
      verifiedMimeType: 'image/png',
      fileSize: 1024,
    };
    attachmentsService.prepareAvatarUpload!.mockResolvedValue(preparedFile);
    attachmentsService.replaceAttachmentInTransaction!.mockResolvedValue({
      savedAttachment: { id: 'att-new', url: preparedFile.publicUrl },
      oldFileUrls: ['/public/uploads/avatars/old.png'],
    });
    mockManager.save.mockRejectedValue({ code: PG_UNIQUE_VIOLATION_CODE });

    await expect(
      usersService.updateCurrentUser(
        {
          id: 'user-uuid-1',
          email: 'sunner@example.com',
          username: 'sunner',
          token: 'existing-token',
        },
        { user: { username: 'concurrent_taken' } },
        {
          originalname: 'avatar.png',
          mimetype: 'image/png',
          size: 1024,
          buffer: Buffer.from('fake-image'),
        },
      ),
    ).rejects.toThrow(ConflictException);

    expect(attachmentsService.deleteFileByAbsolutePath).toHaveBeenCalledWith(
      '/disk/orphan-new.png',
    );
    expect(attachmentsService.deleteFilesByPublicUrls).not.toHaveBeenCalled();
  });

  it('should throw ConflictException if updated email is already taken', async () => {
    userRepository.findOne!.mockResolvedValue({ ...mockUser });
    userRepository.exists!.mockResolvedValue(true);

    await expect(
      usersService.updateCurrentUser(
        {
          id: 'user-uuid-1',
          email: 'sunner@example.com',
          username: 'sunner',
          token: 'existing-token',
        },
        {
          user: {
            email: 'taken@example.com',
          },
        },
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('should throw UnauthorizedException if current user no longer exists', async () => {
    userRepository.findOne!.mockResolvedValue(null);

    await expect(
      usersService.updateCurrentUser(
        {
          id: 'deleted-user',
          email: 'deleted@example.com',
          username: 'deleted',
          token: 'existing-token',
        },
        { user: { bio: 'Hello' } },
      ),
    ).rejects.toThrow(UnauthorizedException);
  });
});
