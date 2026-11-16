import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { I18nContext, I18nService } from 'nestjs-i18n';
import { Repository } from 'typeorm';
import { CurrentUserPayload } from '../../common/decorators/current-user.decorator.js';
import { RedisService } from '../../common/redis/redis.service.js';
import { AttachmentTargetType } from '../attachments/attachments.constants.js';
import {
  AttachmentsService,
  UploadedFilePayload,
} from '../attachments/attachments.service.js';
import {
  BCRYPT_SALT_ROUNDS,
  DEFAULT_LANGUAGE,
  PG_UNIQUE_VIOLATION_CODE,
} from '../auth/auth.constants.js';
import { AuthResponseDto } from '../auth/dto/auth-response.dto.js';
import { UpdateUserDataDto, UpdateUserDto } from './dto/update-user.dto.js';
import { UserEntity } from './entities/user.entity.js';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    private readonly attachmentsService: AttachmentsService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly i18n: I18nService,
  ) {}

  private get lang(): string {
    return I18nContext.current()?.lang ?? DEFAULT_LANGUAGE;
  }

  async create(data: Partial<UserEntity>): Promise<UserEntity> {
    const user = this.userRepository.create(data);
    return this.userRepository.save(user);
  }

  async findById(id: string): Promise<UserEntity | null> {
    return this.userRepository.findOne({ where: { id } });
  }

  async findByEmail(
    email: string,
    includePassword = false,
  ): Promise<UserEntity | null> {
    if (includePassword) {
      return this.userRepository
        .createQueryBuilder('user')
        .addSelect('user.password')
        .where('user.email = :email', { email })
        .getOne();
    }
    return this.userRepository.findOne({ where: { email } });
  }

  async findByUsername(username: string): Promise<UserEntity | null> {
    return this.userRepository.findOne({ where: { username } });
  }

  async existsByEmail(email: string): Promise<boolean> {
    return this.userRepository.exists({
      where: { email },
    });
  }

  async existsByUsername(username: string): Promise<boolean> {
    return this.userRepository.exists({
      where: { username },
    });
  }

  async updateCurrentUser(
    currentUser: CurrentUserPayload,
    dto: UpdateUserDto,
    file?: UploadedFilePayload,
  ): Promise<AuthResponseDto> {
    const user = await this.findCurrentUserOrThrow(currentUser.id);
    const payload = this.extractUpdatePayload(dto);

    const isIdentityChanged = await this.applyIdentityChanges(user, payload);
    const isPasswordChanged = await this.applyPasswordChange(user, payload);
    await this.applyProfileAndAvatarChanges(user, payload, file);

    const updatedUser = await this.saveUpdatedUser(user);

    if (isPasswordChanged) {
      await this.revokeCurrentToken(currentUser);
    }

    const shouldReissueToken = isIdentityChanged || isPasswordChanged;
    const token = shouldReissueToken
      ? await this.generateToken(updatedUser)
      : (currentUser.token ?? (await this.generateToken(updatedUser)));

    return this.buildAuthResponse(updatedUser, token);
  }

  private async findCurrentUserOrThrow(userId: string): Promise<UserEntity> {
    const user = await this.findById(userId);
    if (!user) {
      const message = await this.i18n.t('errors.user_not_found', {
        lang: this.lang,
      });
      throw new UnauthorizedException(message);
    }
    return user;
  }

  private async applyIdentityChanges(
    user: UserEntity,
    payload: UpdateUserDataDto,
  ): Promise<boolean> {
    let changed = false;

    if (payload.email && payload.email !== user.email) {
      const emailTaken = await this.existsByEmail(payload.email);
      if (emailTaken) {
        const message = await this.i18n.t('errors.email_in_use', {
          lang: this.lang,
        });
        throw new ConflictException(message);
      }
      user.email = payload.email;
      changed = true;
    }

    if (payload.username && payload.username !== user.username) {
      const usernameTaken = await this.existsByUsername(payload.username);
      if (usernameTaken) {
        const message = await this.i18n.t('errors.username_in_use', {
          lang: this.lang,
        });
        throw new ConflictException(message);
      }
      user.username = payload.username;
      changed = true;
    }

    return changed;
  }

  private async applyPasswordChange(
    user: UserEntity,
    payload: UpdateUserDataDto,
  ): Promise<boolean> {
    if (!payload.password) {
      return false;
    }
    user.password = await bcrypt.hash(payload.password, BCRYPT_SALT_ROUNDS);
    return true;
  }

  private async applyProfileAndAvatarChanges(
    user: UserEntity,
    payload: UpdateUserDataDto,
    file?: UploadedFilePayload,
  ): Promise<void> {
    if (payload.bio !== undefined) {
      user.bio = payload.bio;
    }

    if (file) {
      const attachment = await this.attachmentsService.uploadAvatar(
        user.id,
        file,
        AttachmentTargetType.USER,
      );
      user.image = attachment.url;
    } else if (payload.image !== undefined) {
      user.image = payload.image;
    }
  }

  private async saveUpdatedUser(user: UserEntity): Promise<UserEntity> {
    try {
      return await this.userRepository.save(user);
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
  }

  private extractUpdatePayload(dto: UpdateUserDto): UpdateUserDataDto {
    const source: UpdateUserDataDto = dto.user ?? dto;
    return {
      username: source.username?.trim(),
      email: source.email?.trim().toLowerCase(),
      password: source.password,
      bio: source.bio,
      image: source.image,
    };
  }

  private async revokeCurrentToken(
    currentUser: CurrentUserPayload,
  ): Promise<void> {
    if (!currentUser.exp) {
      return;
    }
    const nowInSeconds = Math.floor(Date.now() / 1000);
    const ttlSeconds = currentUser.exp - nowInSeconds;
    const blacklistKey = currentUser.jti || currentUser.token;

    if (ttlSeconds > 0 && blacklistKey) {
      await this.redisService.addToBlacklist(blacklistKey, ttlSeconds);
    }
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
