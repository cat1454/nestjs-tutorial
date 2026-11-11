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
import { RedisService } from '../redis/redis.service.js';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
    private readonly i18n: I18nService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractTokenFromHeader(request);
    const lang = I18nContext.current()?.lang;

    if (!token) {
      const message = await this.i18n.t('errors.missing_token', { lang });
      throw new UnauthorizedException(message);
    }

    let payload: {
      sub: string;
      email: string;
      username: string;
      jti?: string;
      exp?: number;
    };

    try {
      const secret = this.configService.getOrThrow<string>('jwt.secret');
      payload = await this.jwtService.verifyAsync(token, { secret });
    } catch {
      const message = await this.i18n.t('errors.invalid_token', { lang });
      throw new UnauthorizedException(message);
    }

    const blacklistKey = payload.jti || token;
    const isRevoked = await this.redisService.isBlacklisted(blacklistKey);
    if (isRevoked) {
      const message = await this.i18n.t('errors.token_revoked', { lang });
      throw new UnauthorizedException(message);
    }

    (request as any).user = {
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
