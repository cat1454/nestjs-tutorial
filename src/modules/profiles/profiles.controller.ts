import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../common/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard.js';
import { ProfileResponseDto } from './dto/profile-response.dto.js';
import { ProfilesService } from './profiles.service.js';

@ApiTags('Profiles')
@Controller('profiles')
export class ProfilesController {
  constructor(private readonly profilesService: ProfilesService) {}

  @Get(':username')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiParam({ name: 'username', example: 'johndoe' })
  @ApiOperation({
    summary: 'Lấy thông tin hồ sơ người dùng (Get Profile)',
    description:
      'Trả về thông tin hồ sơ công khai của người dùng kèm trạng thái following (nếu đã đăng nhập).',
  })
  @ApiOkResponse({
    type: ProfileResponseDto,
    description: 'Lấy hồ sơ thành công',
  })
  @ApiNotFoundResponse({ description: 'Không tìm thấy hồ sơ người dùng' })
  async getProfile(
    @Param('username') username: string,
    @CurrentUser() currentUser?: CurrentUserPayload,
  ): Promise<ProfileResponseDto> {
    return this.profilesService.getProfile(username, currentUser?.id);
  }

  @Post(':username/follow')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiParam({ name: 'username', example: 'johndoe' })
  @ApiOperation({
    summary: 'Theo dõi người dùng (Follow User)',
    description: 'Theo dõi một người dùng theo username.',
  })
  @ApiOkResponse({
    type: ProfileResponseDto,
    description: 'Theo dõi thành công',
  })
  @ApiBadRequestResponse({ description: 'Không thể tự theo dõi chính mình' })
  @ApiUnauthorizedResponse({
    description: 'Chưa đăng nhập hoặc token không hợp lệ',
  })
  @ApiNotFoundResponse({ description: 'Không tìm thấy người dùng' })
  async followUser(
    @Param('username') username: string,
    @CurrentUser() currentUser: CurrentUserPayload,
  ): Promise<ProfileResponseDto> {
    return this.profilesService.followUser(username, currentUser.id);
  }

  @Delete(':username/follow')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiParam({ name: 'username', example: 'johndoe' })
  @ApiOperation({
    summary: 'Bỏ theo dõi người dùng (Unfollow User)',
    description: 'Hủy theo dõi một người dùng theo username.',
  })
  @ApiOkResponse({
    type: ProfileResponseDto,
    description: 'Bỏ theo dõi thành công',
  })
  @ApiBadRequestResponse({
    description: 'Không thể tự bỏ theo dõi chính mình',
  })
  @ApiUnauthorizedResponse({
    description: 'Chưa đăng nhập hoặc token không hợp lệ',
  })
  @ApiNotFoundResponse({ description: 'Không tìm thấy người dùng' })
  async unfollowUser(
    @Param('username') username: string,
    @CurrentUser() currentUser: CurrentUserPayload,
  ): Promise<ProfileResponseDto> {
    return this.profilesService.unfollowUser(username, currentUser.id);
  }
}

