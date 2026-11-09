import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { RedisService } from '../../common/redis/redis.service.js';
import { UserEntity } from '../users/entities/user.entity.js';
import { UsersService } from '../users/users.service.js';
import { AuthResponseDto } from './dto/auth-response.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    const username = dto.user?.username || dto.username;
    const email = dto.user?.email || dto.email;
    const password = dto.user?.password || dto.password;

    if (!username || !email || !password) {
      throw new BadRequestException('Vui lòng cung cấp đầy đủ username, email và password');
    }

    const existingUser = await this.usersService.findByEmailOrUsername(email, username);
    if (existingUser) {
      if (existingUser.email === email) {
        throw new ConflictException('Email này đã được sử dụng');
      }
      throw new ConflictException('Username này đã được sử dụng');
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await this.usersService.create({
      username,
      email,
      password: hashedPassword,
    });

    const token = await this.generateToken(newUser);

    return this.buildAuthResponse(newUser, token);
  }

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const email = dto.user?.email || dto.email;
    const password = dto.user?.password || dto.password;

    if (!email || !password) {
      throw new BadRequestException('Vui lòng cung cấp email và password');
    }

    const user = await this.usersService.findByEmail(email, true);
    if (!user) {
      throw new UnauthorizedException('Email hoặc mật khẩu không chính xác');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Email hoặc mật khẩu không chính xác');
    }

    const token = await this.generateToken(user);

    return this.buildAuthResponse(user, token);
  }

  async logout(token: string): Promise<{ message: string }> {
    try {
      const decoded: any = this.jwtService.decode(token);
      let ttl = 7 * 24 * 60 * 60;

      if (decoded && decoded.exp) {
        const now = Math.floor(Date.now() / 1000);
        ttl = decoded.exp - now;
      }

      if (ttl > 0) {
        await this.redisService.addToBlacklist(token, ttl);
      }

      return { message: 'Đăng xuất thành công, token đã được đưa vào blacklist' };
    } catch {
      throw new BadRequestException('Không thể xử lý yêu cầu đăng xuất');
    }
  }

  async getCurrentUser(userId: string, token: string): Promise<AuthResponseDto> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException('Không tìm thấy thông tin người dùng');
    }

    return this.buildAuthResponse(user, token);
  }

  private async generateToken(user: UserEntity): Promise<string> {
    const payload = {
      sub: user.id,
      email: user.email,
      username: user.username,
    };

    const secret = this.configService.get<string>('jwt.secret', 'default-jwt-secret-key');
    const expiresIn = this.configService.get<string>('jwt.expiresIn', '7d');

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
