import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: Record<string, any>;

  const mockUser = {
    id: 'u-1',
    email: 'a@b.com',
    username: 'alice',
    jti: 'jti-1',
    token: 'jwt-token',
  };

  beforeEach(async () => {
    authService = {
      register: vi.fn().mockResolvedValue({ user: { token: 't1' } }),
      login: vi.fn().mockResolvedValue({ user: { token: 't2' } }),
      logout: vi.fn().mockResolvedValue({ message: 'Logged out' }),
      getCurrentUser: vi.fn().mockResolvedValue({ user: { username: 'alice' } }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('delegates register, login, logout, and getCurrentUser to AuthService', async () => {
    const regDto = {
      user: { username: 'alice', email: 'a@b.com', password: 'Password@123' },
    };
    await controller.register(regDto);
    expect(authService.register).toHaveBeenCalledWith(regDto);

    const loginDto = { user: { email: 'a@b.com', password: 'Password@123' } };
    await controller.login(loginDto);
    expect(authService.login).toHaveBeenCalledWith(loginDto);

    await controller.logout(mockUser);
    expect(authService.logout).toHaveBeenCalledWith(mockUser);

    await controller.getCurrentUser(mockUser);
    expect(authService.getCurrentUser).toHaveBeenCalledWith('u-1', 'jwt-token');

    await controller.getCurrentUser({
      id: 'u-1',
      email: 'a@b.com',
      username: 'alice',
    });
    expect(authService.getCurrentUser).toHaveBeenLastCalledWith('u-1', '');
  });
});
