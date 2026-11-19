import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { I18nContext, I18nService } from 'nestjs-i18n';
import { DEFAULT_LANGUAGE } from '../../modules/auth/auth.constants.js';
import { AuthenticatedRequest } from '../decorators/current-user.decorator.js';
import { RedisService } from '../redis/redis.service.js';

interface VerifiedJwtPayload {
  sub: string;
  email: string;
  username: string;
  jti?: string;
  iat?: number;
  iatMs?: number;
  exp?: number;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
    private readonly i18n: I18nService,
  ) {}

  private get lang(): string {
    return I18nContext.current()?.lang ?? DEFAULT_LANGUAGE;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      const message = await this.i18n.t('errors.missing_token', {
        lang: this.lang,
      });
      throw new UnauthorizedException(message);
    }

    let payload: VerifiedJwtPayload;

    try {
      const secret = this.configService.getOrThrow<string>('jwt.secret');
      payload = await this.jwtService.verifyAsync<VerifiedJwtPayload>(token, {
        secret,
      });
    } catch {
      const message = await this.i18n.t('errors.invalid_token', {
        lang: this.lang,
      });
      throw new UnauthorizedException(message);
    }

    const blacklistKey = payload.jti || token;
    const isRevoked = await this.redisService.isBlacklisted(blacklistKey);
    if (isRevoked) {
      const message = await this.i18n.t('errors.token_revoked', {
        lang: this.lang,
      });
      throw new UnauthorizedException(message);
    }

    const revokedBeforeMs = await this.redisService.getUserRevokedBefore(
      payload.sub,
    );
    if (revokedBeforeMs !== null) {
      const tokenIssuedAtMs =
        payload.iatMs ?? (payload.iat ? payload.iat * 1000 : 0);
      if (tokenIssuedAtMs <= revokedBeforeMs) {
        const message = await this.i18n.t('errors.token_revoked', {
          lang: this.lang,
        });
        throw new UnauthorizedException(message);
      }
    }

    request.user = {
      id: payload.sub,
      email: payload.email,
      username: payload.username,
      jti: payload.jti,
      exp: payload.exp,
      token,
    };

    return true;
  }

  private extractTokenFromHeader(request: Request): string | null {
    const authHeader = request.headers.authorization;
    if (!authHeader) {
      return null;
    }

    const [type, token] = authHeader.split(' ');
    if ((type === 'Bearer' || type === 'Token') && token) {
      return token;
    }

    return null;
  }
}
