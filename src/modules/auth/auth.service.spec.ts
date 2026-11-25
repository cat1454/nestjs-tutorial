import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { I18nService } from 'nestjs-i18n';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TokenService } from '../../common/auth/token.service.js';
import { MailService } from '../mail/mail.service.js';
import { UserEntity } from '../users/entities/user.entity.js';
import { UsersService } from '../users/users.service.js';
import { PG_UNIQUE_VIOLATION_CODE } from './auth.constants.js';
import { AuthService } from './auth.service.js';

describe('AuthService', () => {
  let authService: AuthService;
  let usersService: Partial<Record<keyof UsersService, any>>;
  let tokenService: Partial<Record<keyof TokenService, any>>;
  let mailService: Partial<Record<keyof MailService, any>>;
  let i18nService: Partial<Record<keyof I18nService, any>>;

  const mockUser: UserEntity = {
    id: 'uuid-1234',
    username: 'testuser',
    email: 'test@example.com',
    password: '$2b$10$hashedpassword',
    bio: null,
    image: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    mockUser.password = await bcrypt.hash('password123', 10);

    usersService = {
      existsByEmail: vi.fn(),
      findByEmail: vi.fn(),
      findById: vi.fn(),
      create: vi.fn(),
    };

    tokenService = {
      generateToken: vi.fn().mockResolvedValue('mocked-jwt-token'),
      revokeToken: vi.fn().mockResolvedValue(undefined),
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

    mailService = {
      sendWelcomeEmail: vi.fn().mockResolvedValue(undefined),
    };

    i18nService = {
      t: vi.fn().mockImplementation(async (key: string) => key),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: TokenService, useValue: tokenService },
        { provide: MailService, useValue: mailService },
        { provide: I18nService, useValue: i18nService },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
  });

  describe('register', () => {
    it('should register a new user with normalized lowercase email and return auth response', async () => {
      usersService.existsByEmail!.mockResolvedValue(false);
      usersService.create!.mockResolvedValue(mockUser);

      const result = await authService.register({
        user: {
          username: '  testuser  ',
          email: '  TEST@Example.com  ',
          password: 'password123',
        },
      });

      expect(usersService.existsByEmail).toHaveBeenCalledWith(
        'test@example.com',
      );
      expect(result.user.email).toBe('test@example.com');
      expect(result.user.username).toBe('testuser');
      expect(result.user.token).toBe('mocked-jwt-token');
      expect(usersService.create).toHaveBeenCalled();
      expect(mailService.sendWelcomeEmail).toHaveBeenCalledWith({
        recipientEmail: 'test@example.com',
        username: 'testuser',
      });
    });

    it('should still succeed registration when welcome email enqueue fails', async () => {
      usersService.existsByEmail!.mockResolvedValue(false);
      usersService.create!.mockResolvedValue(mockUser);
      mailService.sendWelcomeEmail!.mockRejectedValueOnce(
        new Error('Redis queue down'),
      );

      const result = await authService.register({
        user: {
          username: 'testuser',
          email: 'test@example.com',
          password: 'password123',
        },
      });

      expect(result.user.token).toBe('mocked-jwt-token');
    });

    it('should throw ConflictException if email is already taken', async () => {
      usersService.existsByEmail!.mockResolvedValue(true);

      await expect(
        authService.register({
          user: {
            username: 'testuser',
            email: 'test@example.com',
            password: 'password123',
          },
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException on PostgreSQL unique constraint violation (23505)', async () => {
      usersService.existsByEmail!.mockResolvedValue(false);
      usersService.create!.mockRejectedValue({
        code: PG_UNIQUE_VIOLATION_CODE,
      });

      await expect(
        authService.register({
          user: {
            username: 'testuser',
            email: 'test@example.com',
            password: 'password123',
          },
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw BadRequestException if required fields are missing', async () => {
      await expect(
        authService.register({
          user: {
            username: '',
            email: '',
            password: '',
          },
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('login', () => {
    it('should authenticate user and return token when credentials are valid', async () => {
      usersService.findByEmail!.mockResolvedValue(mockUser);

      const result = await authService.login({
        user: {
          email: 'TEST@example.com',
          password: 'password123',
        },
      });

      expect(usersService.findByEmail).toHaveBeenCalledWith(
        'test@example.com',
        true,
      );
      expect(result.user.email).toBe('test@example.com');
      expect(result.user.token).toBe('mocked-jwt-token');
    });

    it('should throw UnauthorizedException when password does not match', async () => {
      usersService.findByEmail!.mockResolvedValue(mockUser);

      await expect(
        authService.login({
          user: {
            email: 'test@example.com',
            password: 'wrongpassword',
          },
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should compare with dummy hash and throw UnauthorizedException when user does not exist', async () => {
      usersService.findByEmail!.mockResolvedValue(null);

      await expect(
        authService.login({
          user: {
            email: 'nonexistent@example.com',
            password: 'password123',
          },
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('should delegate token revocation to TokenService and return localized message', async () => {
      const payload = {
        id: 'uuid-1234',
        email: 'test@example.com',
        username: 'testuser',
        jti: 'jti-uuid-1',
        exp: Math.floor(Date.now() / 1000) + 1800,
        token: 'sample-token',
      };

      const result = await authService.logout(payload);

      expect(tokenService.revokeToken).toHaveBeenCalledWith(payload);
      expect(result.message).toBe('common.logout_success');
    });
  });

  describe('getCurrentUser', () => {
    it('should return user info with token', async () => {
      usersService.findById!.mockResolvedValue(mockUser);

      const result = await authService.getCurrentUser(
        'uuid-1234',
        'current-token',
      );

      expect(result.user.email).toBe('test@example.com');
      expect(result.user.token).toBe('current-token');
    });

    it('should throw UnauthorizedException if user not found', async () => {
      usersService.findById!.mockResolvedValue(null);

      await expect(
        authService.getCurrentUser('non-existent-uuid', 'current-token'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
