import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { I18nContext, I18nService } from 'nestjs-i18n';
import { CurrentUserPayload } from '../../common/decorators/current-user.decorator.js';
import { RedisService } from '../../common/redis/redis.service.js';
import { UserEntity } from '../users/entities/user.entity.js';
import { UsersService } from '../users/users.service.js';
import {
  BCRYPT_SALT_ROUNDS,
  DEFAULT_LANGUAGE,
  DUMMY_PASSWORD_HASH,
  PG_UNIQUE_VIOLATION_CODE,
} from './auth.constants.js';
import { AuthResponseDto } from './dto/auth-response.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';

interface DecodedTokenPayload {
  jti?: string;
  exp?: number;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
    private readonly i18n: I18nService,
  ) {}

  private get lang(): string {
    return I18nContext.current()?.lang ?? DEFAULT_LANGUAGE;
  }

  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    const rawUsername = dto.user?.username?.trim();
    const rawEmail = dto.user?.email?.trim().toLowerCase();
    const password = dto.user?.password;

    if (!rawUsername || !rawEmail || !password) {
      const message = await this.i18n.t('errors.bad_request', {
        lang: this.lang,
      });
      throw new BadRequestException(message);
    }

    const emailExists = await this.usersService.existsByEmail(rawEmail);
    if (emailExists) {
      const message = await this.i18n.t('errors.email_in_use', {
        lang: this.lang,
      });
      throw new ConflictException(message);
    }

    const hashedPassword = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

    let newUser: UserEntity;
    try {
      newUser = await this.usersService.create({
        username: rawUsername,
        email: rawEmail,
        password: hashedPassword,
      });
    } catch (error: unknown) {
      const dbError = error as { code?: string };
      if (dbError?.code === PG_UNIQUE_VIOLATION_CODE) {
        const message = await this.i18n.t('errors.user_conflict', {
          lang: this.lang,
        });
        throw new ConflictException(message);
      }
      throw error;
    }

    const token = await this.generateToken(newUser);

    return this.buildAuthResponse(newUser, token);
  }

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const email = dto.user?.email?.trim().toLowerCase();
    const password = dto.user?.password;

    if (!email || !password) {
      const message = await this.i18n.t('errors.bad_request', {
        lang: this.lang,
      });
      throw new BadRequestException(message);
    }

    const user = await this.usersService.findByEmail(email, true);

    const passwordHash = user ? user.password : DUMMY_PASSWORD_HASH;
    const isPasswordValid = await bcrypt.compare(password, passwordHash);

    if (!user || !isPasswordValid) {
      const message = await this.i18n.t('errors.invalid_credentials', {
        lang: this.lang,
      });
      throw new UnauthorizedException(message);
    }

    const token = await this.generateToken(user);

    return this.buildAuthResponse(user, token);
  }

  async logout(user: CurrentUserPayload): Promise<{ message: string }> {
    const token = user?.token;
    const decoded: DecodedTokenPayload | null =
      user?.jti && user?.exp
        ? { jti: user.jti, exp: user.exp }
        : token
          ? (this.jwtService.decode(token) as DecodedTokenPayload | null)
          : null;

    if (!decoded || typeof decoded.exp !== 'number') {
      const message = await this.i18n.t('errors.logout_failed', {
        lang: this.lang,
      });
      throw new BadRequestException(message);
    }

    const nowInSeconds = Math.floor(Date.now() / 1000);
    const ttlSeconds = decoded.exp - nowInSeconds;
    const blacklistKey = decoded.jti || token;

    if (ttlSeconds > 0 && blacklistKey) {
      await this.redisService.addToBlacklist(blacklistKey, ttlSeconds);
    }

    const message = await this.i18n.t('common.logout_success', {
      lang: this.lang,
    });
    return { message };
  }

  async getCurrentUser(userId: string, token: string): Promise<AuthResponseDto> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      const message = await this.i18n.t('errors.user_not_found', {
        lang: this.lang,
      });
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
    const expiresIn =
      this.configService.getOrThrow<JwtSignOptions['expiresIn']>('jwt.expiresIn');

    return this.jwtService.signAsync(payload, {
      secret,
      expiresIn,
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
