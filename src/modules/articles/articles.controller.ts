import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
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
import { ArticlesService } from './articles.service.js';
import {
  ArticleResponseDto,
  ArticlesListResponseDto,
} from './dto/article-response.dto.js';
import { CreateArticleDto } from './dto/create-article.dto.js';
import {
  FeedArticlesQueryDto,
  ListArticlesQueryDto,
} from './dto/list-articles-query.dto.js';
import { UpdateArticleDto } from './dto/update-article.dto.js';

@ApiTags('Articles')
@Controller('articles')
export class ArticlesController {
  constructor(private readonly articlesService: ArticlesService) {}

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Lấy danh sách bài viết (List Articles)',
    description:
      'Hỗ trợ lọc theo tag, author, favorited và phân trang (limit, offset), sắp xếp mới nhất trước.',
  })
  @ApiOkResponse({
    type: ArticlesListResponseDto,
    description: 'Danh sách bài viết',
  })
  async listArticles(
    @Query() query: ListArticlesQueryDto,
    @CurrentUser() currentUser?: CurrentUserPayload,
  ): Promise<ArticlesListResponseDto> {
    return this.articlesService.listArticles(query, currentUser?.id);
  }

  @Get('feed')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Lấy bảng tin từ người dùng đang theo dõi (Feed Articles)',
    description:
      'Trả về danh sách bài viết của các tác giả mà người dùng hiện tại đang theo dõi.',
  })
  @ApiOkResponse({
    type: ArticlesListResponseDto,
    description: 'Danh sách bài viết trong feed cá nhân',
  })
  @ApiUnauthorizedResponse({
    description: 'Chưa đăng nhập hoặc token không hợp lệ',
  })
  async getFeed(
    @Query() query: FeedArticlesQueryDto,
    @CurrentUser() currentUser: CurrentUserPayload,
  ): Promise<ArticlesListResponseDto> {
    return this.articlesService.getFeed(query, currentUser.id);
  }

  @Get(':slug')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiParam({ name: 'slug', example: 'how-to-build-clean-nestjs-apis-a1b2c3d4' })
  @ApiOperation({
    summary: 'Lấy chi tiết bài viết theo slug (Get Article)',
  })
  @ApiOkResponse({
    type: ArticleResponseDto,
    description: 'Chi tiết bài viết',
  })
  @ApiNotFoundResponse({ description: 'Không tìm thấy bài viết' })
  async getArticle(
    @Param('slug') slug: string,
    @CurrentUser() currentUser?: CurrentUserPayload,
  ): Promise<ArticleResponseDto> {
    return this.articlesService.getArticleBySlug(slug, currentUser?.id);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Tạo bài viết mới (Create Article)',
    description: 'Tạo bài viết mới, tự động sinh slug duy nhất và gắn danh sách tags.',
  })
  @ApiCreatedResponse({
    type: ArticleResponseDto,
    description: 'Tạo bài viết thành công',
  })
  @ApiUnauthorizedResponse({
    description: 'Chưa đăng nhập hoặc token không hợp lệ',
  })
  async createArticle(
    @Body() dto: CreateArticleDto,
    @CurrentUser() currentUser: CurrentUserPayload,
  ): Promise<ArticleResponseDto> {
    return this.articlesService.createArticle(dto, currentUser.id);
  }

  @Put(':slug')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiParam({ name: 'slug', example: 'how-to-build-clean-nestjs-apis-a1b2c3d4' })
  @ApiOperation({
    summary: 'Cập nhật bài viết (Update Article)',
    description:
      'Chỉ tác giả mới có quyền cập nhật. Nếu tiêu đề thay đổi sẽ tự động cập nhật slug mới.',
  })
  @ApiOkResponse({
    type: ArticleResponseDto,
    description: 'Cập nhật bài viết thành công',
  })
  @ApiUnauthorizedResponse({
    description: 'Chưa đăng nhập hoặc token không hợp lệ',
  })
  @ApiForbiddenResponse({
    description: 'Chỉ tác giả mới có quyền chỉnh sửa bài viết này',
  })
  @ApiNotFoundResponse({ description: 'Không tìm thấy bài viết' })
  async updateArticle(
    @Param('slug') slug: string,
    @Body() dto: UpdateArticleDto,
    @CurrentUser() currentUser: CurrentUserPayload,
  ): Promise<ArticleResponseDto> {
    return this.articlesService.updateArticle(slug, dto, currentUser.id);
  }

  @Delete(':slug')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiParam({ name: 'slug', example: 'how-to-build-clean-nestjs-apis-a1b2c3d4' })
  @ApiOperation({
    summary: 'Xóa bài viết (Delete Article)',
    description: 'Chỉ tác giả mới có quyền xóa bài viết.',
  })
  @ApiOkResponse({ description: 'Xóa bài viết thành công' })
  @ApiUnauthorizedResponse({
    description: 'Chưa đăng nhập hoặc token không hợp lệ',
  })
  @ApiForbiddenResponse({
    description: 'Chỉ tác giả mới có quyền xóa bài viết này',
  })
  @ApiNotFoundResponse({ description: 'Không tìm thấy bài viết' })
  async deleteArticle(
    @Param('slug') slug: string,
    @CurrentUser() currentUser: CurrentUserPayload,
  ): Promise<{ message: string }> {
    return this.articlesService.deleteArticle(slug, currentUser.id);
  }

  @Post(':slug/favorite')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiParam({ name: 'slug', example: 'how-to-build-clean-nestjs-apis-a1b2c3d4' })
  @ApiOperation({
    summary: 'Yêu thích bài viết (Favorite Article)',
  })
  @ApiOkResponse({
    type: ArticleResponseDto,
    description: 'Yêu thích bài viết thành công',
  })
  @ApiUnauthorizedResponse({
    description: 'Chưa đăng nhập hoặc token không hợp lệ',
  })
  @ApiNotFoundResponse({ description: 'Không tìm thấy bài viết' })
  async favoriteArticle(
    @Param('slug') slug: string,
    @CurrentUser() currentUser: CurrentUserPayload,
  ): Promise<ArticleResponseDto> {
    return this.articlesService.favoriteArticle(slug, currentUser.id);
  }

  @Delete(':slug/favorite')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiParam({ name: 'slug', example: 'how-to-build-clean-nestjs-apis-a1b2c3d4' })
  @ApiOperation({
    summary: 'Bỏ yêu thích bài viết (Unfavorite Article)',
  })
  @ApiOkResponse({
    type: ArticleResponseDto,
    description: 'Bỏ yêu thích bài viết thành công',
  })
  @ApiUnauthorizedResponse({
    description: 'Chưa đăng nhập hoặc token không hợp lệ',
  })
  @ApiNotFoundResponse({ description: 'Không tìm thấy bài viết' })
  async unfavoriteArticle(
    @Param('slug') slug: string,
    @CurrentUser() currentUser: CurrentUserPayload,
  ): Promise<ArticleResponseDto> {
    return this.articlesService.unfavoriteArticle(slug, currentUser.id);
  }
}
