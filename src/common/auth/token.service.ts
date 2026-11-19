import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import { I18nContext, I18nService } from 'nestjs-i18n';
import { DEFAULT_LANGUAGE } from '../../modules/auth/auth.constants.js';
import { AuthResponseDto } from '../../modules/auth/dto/auth-response.dto.js';
import { UserEntity } from '../../modules/users/entities/user.entity.js';
import { CurrentUserPayload } from '../decorators/current-user.decorator.js';
import { RedisService } from '../redis/redis.service.js';

const DEFAULT_REVOCATION_TTL_SECONDS = 7 * 24 * 60 * 60;
const DURATION_MULTIPLIERS_SECONDS: Record<string, number> = {
  s: 1,
  m: 60,
  h: 3600,
  d: 86400,
};

interface DecodedTokenPayload {
  jti?: string;
  exp?: number;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly i18n: I18nService,
  ) {}

  private get lang(): string {
    return I18nContext.current()?.lang ?? DEFAULT_LANGUAGE;
  }

  async generateToken(
    user: UserEntity,
    minIssuedAtMs?: number,
  ): Promise<string> {
    const issuedAtMs = minIssuedAtMs
      ? Math.max(Date.now(), minIssuedAtMs)
      : Date.now();

    const payload = {
      sub: user.id,
      email: user.email,
      username: user.username,
      jti: randomUUID(),
      iatMs: issuedAtMs,
    };

    const secret = this.configService.getOrThrow<string>('jwt.secret');
    const expiresIn =
      this.configService.getOrThrow<JwtSignOptions['expiresIn']>(
        'jwt.expiresIn',
      );

    return this.jwtService.signAsync(payload, {
      secret,
      expiresIn,
    });
  }

  async revokeToken(user: CurrentUserPayload): Promise<void> {
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
  }

  async revokeAllUserTokens(
    userId: string,
    currentUser?: CurrentUserPayload,
  ): Promise<number> {
    const revokedAtMs = Date.now();
    const expiresIn = this.configService.getOrThrow<string>('jwt.expiresIn');
    const ttlSeconds = this.parseDurationToSeconds(expiresIn);

    await this.redisService.setUserRevokedBefore(
      userId,
      revokedAtMs,
      ttlSeconds,
    );

    if (currentUser?.exp) {
      await this.revokeToken(currentUser);
    }

    return revokedAtMs;
  }

  buildAuthResponse(user: UserEntity, token: string): AuthResponseDto {
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

  private parseDurationToSeconds(duration: string | number): number {
    if (typeof duration === 'number' && duration > 0) {
      return duration;
    }

    const trimmed = String(duration).trim();
    const match = /^(\d+)([smhd]?)$/i.exec(trimmed);
    if (!match) {
      return DEFAULT_REVOCATION_TTL_SECONDS;
    }

    const value = Number(match[1]);
    const unit = (match[2] || 's').toLowerCase();
    const multiplier = DURATION_MULTIPLIERS_SECONDS[unit] ?? 1;

    return value * multiplier;
  }
}
