import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { RedisService } from '../redis/redis.service.js';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException('Missing authorization token');
    }

    const isRevoked = await this.redisService.isBlacklisted(token);
    if (isRevoked) {
      throw new UnauthorizedException('Token has been revoked');
    }

    try {
      const secret = this.configService.get<string>(
        'jwt.secret',
        'default-jwt-secret-key',
      );
      const payload = await this.jwtService.verifyAsync(token, { secret });

      (request as any).user = {
        id: payload.sub,
        email: payload.email,
        username: payload.username,
        token,
      };

      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
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
