import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { I18nContext, I18nService } from 'nestjs-i18n';
import { DataSource, Repository } from 'typeorm';
import { TokenService } from '../../common/auth/token.service.js';
import { CurrentUserPayload } from '../../common/decorators/current-user.decorator.js';
import { AttachmentTargetType } from '../attachments/attachments.constants.js';
import {
  AttachmentsService,
  PreparedAvatarFile,
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
    private readonly dataSource: DataSource,
    private readonly attachmentsService: AttachmentsService,
    private readonly tokenService: TokenService,
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
    this.applyProfileChanges(user, payload);

    const preparedAvatar = file
      ? await this.attachmentsService.prepareAvatarUpload(file)
      : null;

    const { updatedUser, oldAvatarUrls } =
      await this.commitUserAndAvatarTransaction(user, preparedAvatar);

    if (oldAvatarUrls.length > 0) {
      await this.attachmentsService.deleteFilesByPublicUrls(oldAvatarUrls);
    }

    let minIssuedAtMs: number | undefined;
    if (isPasswordChanged) {
      const revokedAtMs = await this.tokenService.revokeAllUserTokens(
        updatedUser.id,
        currentUser,
      );
      minIssuedAtMs = revokedAtMs + 1;
    }

    const shouldReissueToken = isIdentityChanged || isPasswordChanged;
    const token = shouldReissueToken
      ? await this.tokenService.generateToken(updatedUser, minIssuedAtMs)
      : (currentUser.token ??
        (await this.tokenService.generateToken(updatedUser)));

    return this.tokenService.buildAuthResponse(updatedUser, token);
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

  private applyProfileChanges(
    user: UserEntity,
    payload: UpdateUserDataDto,
  ): void {
    if (payload.bio !== undefined) {
      user.bio = payload.bio;
    }
    if (payload.image !== undefined) {
      user.image = payload.image;
    }
  }

  private async commitUserAndAvatarTransaction(
    user: UserEntity,
    preparedAvatar: PreparedAvatarFile | null,
  ): Promise<{ updatedUser: UserEntity; oldAvatarUrls: string[] }> {
    try {
      return await this.dataSource.transaction(async (manager) => {
        let oldAvatarUrls: string[] = [];

        if (preparedAvatar) {
          const replacement =
            await this.attachmentsService.replaceAttachmentInTransaction(
              manager,
              user.id,
              preparedAvatar,
              AttachmentTargetType.USER,
            );
          user.image = replacement.savedAttachment.url;
          oldAvatarUrls = replacement.oldFileUrls;
        }

        const updatedUser = await manager.save(UserEntity, user);
        return { updatedUser, oldAvatarUrls };
      });
    } catch (error: unknown) {
      if (preparedAvatar) {
        await this.attachmentsService.deleteFileByAbsolutePath(
          preparedAvatar.absoluteFilePath,
        );
      }

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
}
