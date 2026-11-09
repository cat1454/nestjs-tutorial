import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ArticlesService } from './articles.service.js';

@ApiTags('Articles')
@Controller('articles')
export class ArticlesController {
  constructor(private readonly articlesService: ArticlesService) {}

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách bài viết (In-memory Overview)' })
  @ApiResponse({ status: 200, description: 'Danh sách bài viết' })
  findAll() {
    return this.articlesService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Lấy bài viết theo ID (In-memory Overview)' })
  @ApiParam({ name: 'id', type: Number, description: 'ID của bài viết (số nguyên)' })
  @ApiResponse({ status: 200, description: 'Chi tiết bài viết' })
  @ApiResponse({ status: 400, description: 'Lỗi ParseIntPipe khi id không phải là số' })
  @ApiResponse({ status: 404, description: 'Lỗi NotFoundException khi không tìm thấy bài viết' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    const article = this.articlesService.findOne(id);
    if (!article) {
      throw new NotFoundException('Article not found');
    }
    return article;
  }
}

