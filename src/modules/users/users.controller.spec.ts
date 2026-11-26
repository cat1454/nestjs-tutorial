import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

describe('UsersController', () => {
  let controller: UsersController;
  let usersService: Record<string, any>;

  const mockUser = {
    id: 'u-1',
    email: 'a@b.com',
    username: 'alice',
    token: 'jwt-token',
  };

  beforeEach(async () => {
    usersService = {
      updateCurrentUser: vi.fn().mockResolvedValue({ user: { bio: 'new' } }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: usersService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<UsersController>(UsersController);
  });

  it('delegates updateCurrentUser with optional uploaded avatar file', async () => {
    const dto = { user: { bio: 'Updated bio' } };
    const file = {
      originalname: 'a.png',
      mimetype: 'image/png',
      size: 10,
      buffer: Buffer.alloc(10),
    };

    await controller.updateCurrentUser(mockUser, dto, file);
    expect(usersService.updateCurrentUser).toHaveBeenCalledWith(
      mockUser,
      dto,
      file,
    );
  });
});
