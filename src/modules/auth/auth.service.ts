import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { I18nContext, I18nService } from 'nestjs-i18n';
import { TokenService } from '../../common/auth/token.service.js';
import { CurrentUserPayload } from '../../common/decorators/current-user.decorator.js';
import { MailService } from '../mail/mail.service.js';
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

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly tokenService: TokenService,
    private readonly mailService: MailService,
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

    const token = await this.tokenService.generateToken(newUser);

    try {
      await this.mailService.sendWelcomeEmail({
        recipientEmail: newUser.email,
        username: newUser.username,
        lang: this.lang,
      });
    } catch (error) {
      this.logger.warn(
        `Failed to enqueue welcome email for "${newUser.email}": ${(error as Error).message}`,
      );
    }

    return this.tokenService.buildAuthResponse(newUser, token);
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

    const token = await this.tokenService.generateToken(user);

    return this.tokenService.buildAuthResponse(user, token);
  }

  async logout(user: CurrentUserPayload): Promise<{ message: string }> {
    await this.tokenService.revokeToken(user);

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

    return this.tokenService.buildAuthResponse(user, token);
  }
}
