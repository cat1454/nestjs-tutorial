import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { I18nService } from 'nestjs-i18n';
import { Repository } from 'typeorm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RedisService } from '../../common/redis/redis.service.js';
import { AttachmentTargetType } from '../attachments/attachments.constants.js';
import { AttachmentsService } from '../attachments/attachments.service.js';
import { PG_UNIQUE_VIOLATION_CODE } from '../auth/auth.constants.js';
import { UserEntity } from './entities/user.entity.js';
import { UsersService } from './users.service.js';

describe('UsersService', () => {
  let usersService: UsersService;
  let userRepository: Partial<Record<keyof Repository<UserEntity>, any>>;
  let attachmentsService: Partial<Record<keyof AttachmentsService, any>>;
  let jwtService: Partial<Record<keyof JwtService, any>>;
  let configService: Partial<Record<keyof ConfigService, any>>;
  let redisService: Partial<Record<keyof RedisService, any>>;
  let i18nService: Partial<Record<keyof I18nService, any>>;

  const mockUser: UserEntity = {
    id: 'user-uuid-1',
    username: 'sunner',
    email: 'sunner@example.com',
    password: 'hashed-password',
    bio: null,
    image: null,
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

    attachmentsService = {
      uploadAvatar: vi.fn(),
    };

    jwtService = {
      signAsync: vi.fn().mockResolvedValue('new-jwt-token'),
    };

    configService = {
      getOrThrow: vi.fn((key: string) => {
        if (key === 'jwt.secret') return 'test-secret';
        if (key === 'jwt.expiresIn') return '7d';
        return '';
      }),
    };

    redisService = {
      addToBlacklist: vi.fn().mockResolvedValue(undefined),
    };

    i18nService = {
      t: vi.fn().mockImplementation(async (key: string) => key),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(UserEntity), useValue: userRepository },
        { provide: AttachmentsService, useValue: attachmentsService },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: configService },
        { provide: RedisService, useValue: redisService },
        { provide: I18nService, useValue: i18nService },
      ],
    }).compile();

    usersService = module.get<UsersService>(UsersService);
  });

  it('should update bio and username successfully', async () => {
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

  it('should revoke old token in Redis and issue new token when password is changed', async () => {
    userRepository.findOne!.mockResolvedValue({ ...mockUser });
    const futureExp = Math.floor(Date.now() / 1000) + 3600;

    const result = await usersService.updateCurrentUser(
      {
        id: 'user-uuid-1',
        email: 'sunner@example.com',
        username: 'sunner',
        jti: 'old-jti-123',
        exp: futureExp,
        token: 'old-token',
      },
      {
        user: {
          password: 'NewPassword@123',
        },
      },
    );

    expect(redisService.addToBlacklist).toHaveBeenCalledWith(
      'old-jti-123',
      expect.any(Number),
    );
    expect(result.user.token).toBe('new-jwt-token');
  });

  it('should upload avatar via AttachmentsService and update user image URL', async () => {
    userRepository.findOne!.mockResolvedValue({ ...mockUser });
    attachmentsService.uploadAvatar!.mockResolvedValue({
      id: 'att-uuid-1',
      url: '/public/uploads/avatars/att-uuid-1.png',
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

    expect(attachmentsService.uploadAvatar).toHaveBeenCalledWith(
      'user-uuid-1',
      fakeFile,
      AttachmentTargetType.USER,
    );
    expect(result.user.image).toBe('/public/uploads/avatars/att-uuid-1.png');
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

  it('should throw ConflictException on PostgreSQL unique violation (23505)', async () => {
    userRepository.findOne!.mockResolvedValue({ ...mockUser });
    userRepository.exists!.mockResolvedValue(false);
    userRepository.save!.mockRejectedValue({ code: PG_UNIQUE_VIOLATION_CODE });

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
            username: 'concurrent_user',
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

