import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
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
import { CommentsService } from './comments.service.js';
import {
  CommentResponseDto,
  CommentsListResponseDto,
} from './dto/comment-response.dto.js';
import { CreateCommentDto } from './dto/create-comment.dto.js';

@ApiTags('Comments')
@Controller('articles/:slug/comments')
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiParam({ name: 'slug', example: 'how-to-build-clean-nestjs-apis-a1b2c3d4' })
  @ApiOperation({
    summary: 'Thêm bình luận vào bài viết (Add Comment)',
    description:
      'Thêm bình luận mới vào bài viết và đẩy job gửi email thông báo cho tác giả bài viết vào BullMQ queue.',
  })
  @ApiCreatedResponse({
    type: CommentResponseDto,
    description: 'Tạo bình luận thành công',
  })
  @ApiBadRequestResponse({ description: 'Dữ liệu bình luận không hợp lệ' })
  @ApiUnauthorizedResponse({
    description: 'Chưa đăng nhập hoặc token không hợp lệ',
  })
  @ApiNotFoundResponse({ description: 'Không tìm thấy bài viết' })
  async addComment(
    @Param('slug') slug: string,
    @Body() dto: CreateCommentDto,
    @CurrentUser() currentUser: CurrentUserPayload,
  ): Promise<CommentResponseDto> {
    return this.commentsService.addComment(slug, dto, currentUser.id);
  }

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiParam({ name: 'slug', example: 'how-to-build-clean-nestjs-apis-a1b2c3d4' })
  @ApiOperation({
    summary: 'Lấy danh sách bình luận của bài viết (Get Comments)',
    description:
      'Trả về danh sách bình luận mới nhất trước, kèm trạng thái following của tác giả nếu người dùng đã đăng nhập.',
  })
  @ApiOkResponse({
    type: CommentsListResponseDto,
    description: 'Danh sách bình luận của bài viết',
  })
  @ApiNotFoundResponse({ description: 'Không tìm thấy bài viết' })
  async getComments(
    @Param('slug') slug: string,
    @CurrentUser() currentUser?: CurrentUserPayload,
  ): Promise<CommentsListResponseDto> {
    return this.commentsService.getCommentsBySlug(slug, currentUser?.id);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiParam({ name: 'slug', example: 'how-to-build-clean-nestjs-apis-a1b2c3d4' })
  @ApiParam({
    name: 'id',
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'UUID của bình luận',
  })
  @ApiOperation({
    summary: 'Xóa bình luận (Delete Comment)',
    description: 'Chỉ tác giả bình luận mới có quyền xóa bình luận của mình.',
  })
  @ApiOkResponse({ description: 'Xóa bình luận thành công' })
  @ApiBadRequestResponse({ description: 'ID bình luận không đúng định dạng UUID' })
  @ApiUnauthorizedResponse({
    description: 'Chưa đăng nhập hoặc token không hợp lệ',
  })
  @ApiForbiddenResponse({
    description: 'Bạn không có quyền xóa bình luận này',
  })
  @ApiNotFoundResponse({
    description: 'Không tìm thấy bài viết hoặc bình luận',
  })
  async deleteComment(
    @Param('slug') slug: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: CurrentUserPayload,
  ): Promise<{ message: string }> {
    return this.commentsService.deleteComment(slug, id, currentUser.id);
  }
}
