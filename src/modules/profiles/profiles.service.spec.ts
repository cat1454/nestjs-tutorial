import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { I18nService } from 'nestjs-i18n';
import { Repository } from 'typeorm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserEntity } from '../users/entities/user.entity.js';
import { UsersService } from '../users/users.service.js';
import { FollowEntity } from './entities/follow.entity.js';
import { ProfilesService } from './profiles.service.js';

describe('ProfilesService', () => {
  let profilesService: ProfilesService;
  let followRepository: Partial<Record<keyof Repository<FollowEntity>, any>>;
  let usersService: Partial<Record<keyof UsersService, any>>;
  let i18nService: Partial<Record<keyof I18nService, any>>;

  const targetUser: UserEntity = {
    id: 'target-uuid',
    username: 'bob',
    email: 'bob@example.com',
    password: 'hashed',
    bio: 'Bob bio',
    image: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    followRepository = {
      exists: vi.fn(),
      create: vi.fn((data) => data),
      save: vi.fn((data) => Promise.resolve(data)),
      delete: vi.fn().mockResolvedValue({ affected: 1 }),
    };

    usersService = {
      findByUsername: vi.fn(),
    };

    i18nService = {
      t: vi.fn().mockImplementation(async (key: string) => key),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProfilesService,
        {
          provide: getRepositoryToken(FollowEntity),
          useValue: followRepository,
        },
        { provide: UsersService, useValue: usersService },
        { provide: I18nService, useValue: i18nService },
      ],
    }).compile();

    profilesService = module.get<ProfilesService>(ProfilesService);
  });

  describe('getProfile', () => {
    it('should return profile with following=false for anonymous user', async () => {
      usersService.findByUsername!.mockResolvedValue(targetUser);

      const res = await profilesService.getProfile('bob');

      expect(res.profile).toEqual({
        username: 'bob',
        bio: 'Bob bio',
        image: null,
        following: false,
      });
      expect(followRepository.exists).not.toHaveBeenCalled();
    });

    it('should return profile with following=true when currentUser follows targetUser', async () => {
      usersService.findByUsername!.mockResolvedValue(targetUser);
      followRepository.exists!.mockResolvedValue(true);

      const res = await profilesService.getProfile('bob', 'alice-uuid');

      expect(res.profile.following).toBe(true);
    });

    it('should throw NotFoundException when target username does not exist', async () => {
      usersService.findByUsername!.mockResolvedValue(null);

      await expect(profilesService.getProfile('unknown')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('followUser', () => {
    it('should create follow relation and return following=true', async () => {
      usersService.findByUsername!.mockResolvedValue(targetUser);
      followRepository.exists!.mockResolvedValue(false);

      const res = await profilesService.followUser('bob', 'alice-uuid');

      expect(followRepository.save).toHaveBeenCalled();
      expect(res.profile.following).toBe(true);
    });

    it('should throw BadRequestException when user tries to follow themselves', async () => {
      usersService.findByUsername!.mockResolvedValue(targetUser);

      await expect(
        profilesService.followUser('bob', 'target-uuid'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('unfollowUser', () => {
    it('should delete follow relation and return following=false', async () => {
      usersService.findByUsername!.mockResolvedValue(targetUser);

      const res = await profilesService.unfollowUser('bob', 'alice-uuid');

      expect(followRepository.delete).toHaveBeenCalledWith({
        followerId: 'alice-uuid',
        followingId: 'target-uuid',
      });
      expect(res.profile.following).toBe(false);
    });

    it('should throw BadRequestException when user tries to unfollow themselves', async () => {
      usersService.findByUsername!.mockResolvedValue(targetUser);

      await expect(
        profilesService.unfollowUser('bob', 'target-uuid'),
      ).rejects.toThrow(BadRequestException);
    });
  });
});

