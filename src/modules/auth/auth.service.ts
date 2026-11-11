import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { I18nContext, I18nService } from 'nestjs-i18n';
import { RedisService } from '../../common/redis/redis.service.js';
import { UserEntity } from '../users/entities/user.entity.js';
import { UsersService } from '../users/users.service.js';
import { AuthResponseDto } from './dto/auth-response.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';

const DUMMY_PASSWORD_HASH =
  '$2b$10$CwTycUXWue0Thq9StjUM0uJ8p3t/6a/jA.g5.G0Q/S6i2/u/G/6a.';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
    private readonly i18n: I18nService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    const lang = I18nContext.current()?.lang;
    const rawUsername = dto.user?.username || dto.username;
    const rawEmail = dto.user?.email || dto.email;
    const password = dto.user?.password || dto.password;

    if (!rawUsername || !rawEmail || !password) {
      const message = await this.i18n.t('errors.bad_request', { lang });
      throw new BadRequestException(message);
    }

    const username = rawUsername.trim();
    const email = rawEmail.trim().toLowerCase();

    const existingUser = await this.usersService.findByEmailOrUsername(
      email,
      username,
    );
    if (existingUser) {
      if (existingUser.email === email) {
        const message = await this.i18n.t('errors.email_in_use', { lang });
        throw new ConflictException(message);
      }
      const message = await this.i18n.t('errors.username_in_use', { lang });
      throw new ConflictException(message);
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    let newUser: UserEntity;
    try {
      newUser = await this.usersService.create({
        username,
        email,
        password: hashedPassword,
      });
    } catch (error: any) {
      if (error?.code === '23505') {
        const message = await this.i18n.t('errors.user_conflict', { lang });
        throw new ConflictException(message);
      }
      throw error;
    }

    const token = await this.generateToken(newUser);

    return this.buildAuthResponse(newUser, token);
  }

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const lang = I18nContext.current()?.lang;
    const rawEmail = dto.user?.email || dto.email;
    const password = dto.user?.password || dto.password;

    if (!rawEmail || !password) {
      const message = await this.i18n.t('errors.bad_request', { lang });
      throw new BadRequestException(message);
    }

    const email = rawEmail.trim().toLowerCase();
    const user = await this.usersService.findByEmail(email, true);

    const passwordHash = user ? user.password : DUMMY_PASSWORD_HASH;
    const isPasswordValid = await bcrypt.compare(password, passwordHash);

    if (!user || !isPasswordValid) {
      const message = await this.i18n.t('errors.invalid_credentials', { lang });
      throw new UnauthorizedException(message);
    }

    const token = await this.generateToken(user);

    return this.buildAuthResponse(user, token);
  }

  async logout(
    token: string,
    jti?: string,
    exp?: number,
  ): Promise<{ message: string }> {
    const lang = I18nContext.current()?.lang;
    const decoded: any =
      jti && exp ? { jti, exp } : this.jwtService.decode(token);

    if (!decoded || typeof decoded.exp !== 'number') {
      const message = await this.i18n.t('errors.logout_failed', { lang });
      throw new BadRequestException(message);
    }

    const now = Math.floor(Date.now() / 1000);
    const ttl = decoded.exp - now;
    const blacklistKey = decoded.jti || token;

    if (ttl > 0) {
      await this.redisService.addToBlacklist(blacklistKey, ttl);
    }

    const message = await this.i18n.t('common.logout_success', { lang });
    return { message };
  }

  async getCurrentUser(userId: string, token: string): Promise<AuthResponseDto> {
    const lang = I18nContext.current()?.lang;
    const user = await this.usersService.findById(userId);
    if (!user) {
      const message = await this.i18n.t('errors.user_not_found', { lang });
      throw new UnauthorizedException(message);
    }

    return this.buildAuthResponse(user, token);
  }

  private async generateToken(user: UserEntity): Promise<string> {
    const payload = {
      sub: user.id,
      email: user.email,
      username: user.username,
      jti: randomUUID(),
    };

    const secret = this.configService.getOrThrow<string>('jwt.secret');
    const expiresIn = this.configService.getOrThrow<string>('jwt.expiresIn');

    return this.jwtService.signAsync(payload, {
      secret,
      expiresIn: expiresIn as any,
    });
  }

  private buildAuthResponse(user: UserEntity, token: string): AuthResponseDto {
    return {
      user: {
        email: user.email,
        token,
        username: user.username,
        bio: user.bio,
        image: user.image,
      },
    };
  }
}
