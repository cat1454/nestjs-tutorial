import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { I18nService } from 'nestjs-i18n';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RedisService } from '../../common/redis/redis.service.js';
import { UserEntity } from '../users/entities/user.entity.js';
import { UsersService } from '../users/users.service.js';
import { AuthService } from './auth.service.js';

describe('AuthService', () => {
  let authService: AuthService;
  let usersService: Partial<Record<keyof UsersService, any>>;
  let jwtService: Partial<Record<keyof JwtService, any>>;
  let redisService: Partial<Record<keyof RedisService, any>>;
  let configService: Partial<Record<keyof ConfigService, any>>;
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
      findByEmailOrUsername: vi.fn(),
      findByEmail: vi.fn(),
      findById: vi.fn(),
      create: vi.fn(),
    };

    jwtService = {
      signAsync: vi.fn().mockResolvedValue('mocked-jwt-token'),
      decode: vi.fn().mockReturnValue({
        jti: 'jti-1234',
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    };

    redisService = {
      addToBlacklist: vi.fn().mockResolvedValue(undefined),
      isBlacklisted: vi.fn().mockResolvedValue(false),
    };

    configService = {
      getOrThrow: vi.fn((key: string) => {
        if (key === 'jwt.secret') return 'test-secret';
        if (key === 'jwt.expiresIn') return '7d';
        return '';
      }),
    };

    i18nService = {
      t: vi.fn().mockImplementation(async (key: string) => key),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: JwtService, useValue: jwtService },
        { provide: RedisService, useValue: redisService },
        { provide: ConfigService, useValue: configService },
        { provide: I18nService, useValue: i18nService },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
  });

  describe('register', () => {
    it('should register a new user with normalized lowercase email and return auth response', async () => {
      usersService.findByEmailOrUsername!.mockResolvedValue(null);
      usersService.create!.mockResolvedValue(mockUser);

      const result = await authService.register({
        user: {
          username: '  testuser  ',
          email: '  TEST@Example.com  ',
          password: 'password123',
        },
      });

      expect(usersService.findByEmailOrUsername).toHaveBeenCalledWith(
        'test@example.com',
        'testuser',
      );
      expect(result.user.email).toBe('test@example.com');
      expect(result.user.username).toBe('testuser');
      expect(result.user.token).toBe('mocked-jwt-token');
      expect(usersService.create).toHaveBeenCalled();
    });

    it('should throw ConflictException if email or username is already taken', async () => {
      usersService.findByEmailOrUsername!.mockResolvedValue(mockUser);

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
      usersService.findByEmailOrUsername!.mockResolvedValue(null);
      usersService.create!.mockRejectedValue({ code: '23505' });

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
    it('should blacklist the token jti in Redis with remaining TTL (exp - now)', async () => {
      const futureExp = Math.floor(Date.now() / 1000) + 1800;
      const result = await authService.logout(
        'sample-token',
        'jti-uuid-1',
        futureExp,
      );

      expect(redisService.addToBlacklist).toHaveBeenCalledWith(
        'jti-uuid-1',
        expect.any(Number),
      );
      expect(result.message).toBe('common.logout_success');
    });

    it('should throw BadRequestException if token has no exp claim', async () => {
      jwtService.decode!.mockReturnValue(null);

      await expect(authService.logout('invalid-token')).rejects.toThrow(
        BadRequestException,
      );
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
