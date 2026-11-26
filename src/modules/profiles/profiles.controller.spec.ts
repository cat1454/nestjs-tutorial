import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard.js';
import { ProfilesController } from './profiles.controller.js';
import { ProfilesService } from './profiles.service.js';

describe('ProfilesController', () => {
  let controller: ProfilesController;
  let profilesService: Record<string, any>;

  const mockUser = {
    id: 'u-1',
    email: 'a@b.com',
    username: 'alice',
  };

  beforeEach(async () => {
    profilesService = {
      getProfile: vi.fn().mockResolvedValue({ profile: { username: 'bob' } }),
      followUser: vi.fn().mockResolvedValue({ profile: { following: true } }),
      unfollowUser: vi.fn().mockResolvedValue({ profile: { following: false } }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProfilesController],
      providers: [{ provide: ProfilesService, useValue: profilesService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(OptionalJwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ProfilesController>(ProfilesController);
  });

  it('delegates getProfile, followUser, and unfollowUser to ProfilesService', async () => {
    await controller.getProfile('bob', mockUser);
    expect(profilesService.getProfile).toHaveBeenCalledWith('bob', 'u-1');

    await controller.getProfile('bob', undefined);
    expect(profilesService.getProfile).toHaveBeenLastCalledWith(
      'bob',
      undefined,
    );

    await controller.followUser('bob', mockUser);
    expect(profilesService.followUser).toHaveBeenCalledWith('bob', 'u-1');

    await controller.unfollowUser('bob', mockUser);
    expect(profilesService.unfollowUser).toHaveBeenCalledWith('bob', 'u-1');
  });
});
