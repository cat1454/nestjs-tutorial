import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { I18nContext, I18nService } from 'nestjs-i18n';
import { Repository } from 'typeorm';
import {
  DEFAULT_LANGUAGE,
  PG_UNIQUE_VIOLATION_CODE,
} from '../auth/auth.constants.js';
import { UserEntity } from '../users/entities/user.entity.js';
import { UsersService } from '../users/users.service.js';
import { ProfileResponseDto } from './dto/profile-response.dto.js';
import { FollowEntity } from './entities/follow.entity.js';

@Injectable()
export class ProfilesService {
  constructor(
    @InjectRepository(FollowEntity)
    private readonly followRepository: Repository<FollowEntity>,
    private readonly usersService: UsersService,
    private readonly i18n: I18nService,
  ) {}

  private get lang(): string {
    return I18nContext.current()?.lang ?? DEFAULT_LANGUAGE;
  }

  async getProfile(
    username: string,
    currentUserId?: string,
  ): Promise<ProfileResponseDto> {
    const targetUser = await this.findTargetUserOrThrow(username);

    let following = false;
    if (currentUserId && currentUserId !== targetUser.id) {
      following = await this.followRepository.exists({
        where: {
          followerId: currentUserId,
          followingId: targetUser.id,
        },
      });
    }

    return this.buildProfileResponse(targetUser, following);
  }

  async followUser(
    username: string,
    currentUserId: string,
  ): Promise<ProfileResponseDto> {
    const targetUser = await this.findTargetUserOrThrow(username);

    if (targetUser.id === currentUserId) {
      const message = await this.i18n.t('errors.cannot_follow_self', {
        lang: this.lang,
      });
      throw new BadRequestException(message);
    }

    const alreadyFollowing = await this.followRepository.exists({
      where: {
        followerId: currentUserId,
        followingId: targetUser.id,
      },
    });

    if (!alreadyFollowing) {
      try {
        const follow = this.followRepository.create({
          followerId: currentUserId,
          followingId: targetUser.id,
        });
        await this.followRepository.save(follow);
      } catch (error: unknown) {
        const dbError = error as { code?: string };
        if (dbError?.code !== PG_UNIQUE_VIOLATION_CODE) {
          throw error;
        }
      }
    }

    return this.buildProfileResponse(targetUser, true);
  }

  async unfollowUser(
    username: string,
    currentUserId: string,
  ): Promise<ProfileResponseDto> {
    const targetUser = await this.findTargetUserOrThrow(username);

    if (targetUser.id === currentUserId) {
      const message = await this.i18n.t('errors.cannot_unfollow_self', {
        lang: this.lang,
      });
      throw new BadRequestException(message);
    }

    await this.followRepository.delete({
      followerId: currentUserId,
      followingId: targetUser.id,
    });

    return this.buildProfileResponse(targetUser, false);
  }

  private async findTargetUserOrThrow(username: string): Promise<UserEntity> {
    const normalizedUsername = username.trim();
    const user = await this.usersService.findByUsername(normalizedUsername);
    if (!user) {
      const message = await this.i18n.t('errors.profile_not_found', {
        lang: this.lang,
      });
      throw new NotFoundException(message);
    }
    return user;
  }

  private buildProfileResponse(
    user: UserEntity,
    following: boolean,
  ): ProfileResponseDto {
    return {
      profile: {
        username: user.username,
        bio: user.bio,
        image: user.image,
        following,
      },
    };
  }
}

