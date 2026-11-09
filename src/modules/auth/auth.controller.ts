import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../common/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { AuthService } from './auth.service.js';
import { AuthResponseDto } from './dto/auth-response.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';

@ApiTags('Authentication')
@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('users')
  @ApiOperation({
    summary: 'Đăng ký tài khoản người dùng mới (Register)',
    description:
      'Tạo tài khoản mới với username, email và password. Trả về thông tin người dùng kèm JWT Token.',
  })
  @ApiOkResponse({ type: AuthResponseDto, description: 'Đăng ký thành công' })
  @ApiConflictResponse({ description: 'Email hoặc username đã tồn tại' })
  async register(@Body() dto: RegisterDto): Promise<AuthResponseDto> {
    return this.authService.register(dto);
  }

  @Post('users/login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Đăng nhập vào hệ thống (Login)',
    description:
      'Xác thực người dùng bằng email và password. Trả về JWT Token để sử dụng cho các API bảo mật.',
  })
  @ApiOkResponse({ type: AuthResponseDto, description: 'Đăng nhập thành công' })
  @ApiUnauthorizedResponse({ description: 'Email hoặc mật khẩu không chính xác' })
  async login(@Body() dto: LoginDto): Promise<AuthResponseDto> {
    return this.authService.login(dto);
  }

  @Post('users/logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Đăng xuất tài khoản & Thu hồi token vào Redis Blacklist (Logout)',
    description:
      'Đưa JWT token hiện tại vào danh sách đen (Blacklist) trong Redis với thời gian TTL bằng thời hạn còn lại của token.',
  })
  @ApiOkResponse({ description: 'Đăng xuất và đưa token vào blacklist thành công' })
  @ApiUnauthorizedResponse({ description: 'Token không hợp lệ hoặc đã bị thu hồi' })
  async logout(
    @CurrentUser() user: CurrentUserPayload,
    @Headers('authorization') authHeader: string,
  ): Promise<{ message: string }> {
    const token = user?.token || authHeader?.replace(/^(Bearer|Token)\s+/, '');
    return this.authService.logout(token);
  }

  @Get('user')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Lấy thông tin người dùng hiện tại (Get Current User)',
    description:
      'Yêu cầu Bearer Token hợp lệ (chưa bị thu hồi). Trả về thông tin cá nhân và JWT token.',
  })
  @ApiOkResponse({ type: AuthResponseDto, description: 'Lấy thông tin thành công' })
  @ApiUnauthorizedResponse({ description: 'Chưa đăng nhập hoặc token không hợp lệ' })
  async getCurrentUser(
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<AuthResponseDto> {
    return this.authService.getCurrentUser(user.id, user.token!);
  }
}

