import {
  Body,
  Controller,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiConsumes,
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
import { MAX_AVATAR_FILE_SIZE_BYTES } from '../attachments/attachments.constants.js';
import { UploadedFilePayload } from '../attachments/attachments.service.js';
import { AuthResponseDto } from '../auth/dto/auth-response.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { AVATAR_FIELD_NAME } from './users.constants.js';
import { UsersService } from './users.service.js';

@ApiTags('Users')
@Controller('user')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Put()
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor(AVATAR_FIELD_NAME, {
      limits: {
        fileSize: MAX_AVATAR_FILE_SIZE_BYTES,
      },
    }),
  )
  @ApiBearerAuth('JWT-auth')
  @ApiConsumes('application/json', 'multipart/form-data')
  @ApiOperation({
    summary:
      'Cập nhật thông tin người dùng hiện tại & tải lên Avatar (Update User)',
    description:
      'Cho phép cập nhật email, username, password, bio, image hoặc tải lên tệp avatar (lưu thông tin vào bảng đa hình attachments). Khi đổi mật khẩu sẽ tự động thu hồi toàn bộ phiên đăng nhập cũ.',
  })
  @ApiOkResponse({
    type: AuthResponseDto,
    description: 'Cập nhật thông tin người dùng thành công',
  })
  @ApiConflictResponse({ description: 'Email hoặc username đã được sử dụng' })
  @ApiUnauthorizedResponse({
    description: 'Chưa đăng nhập hoặc token không hợp lệ',
  })
  async updateCurrentUser(
    @CurrentUser() currentUser: CurrentUserPayload,
    @Body() dto: UpdateUserDto,
    @UploadedFile() file?: UploadedFilePayload,
  ): Promise<AuthResponseDto> {
    return this.usersService.updateCurrentUser(currentUser, dto, file);
  }
}
