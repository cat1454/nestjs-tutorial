import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ArticlesService } from './articles.service.js';
import { TagsResponseDto } from './dto/article-response.dto.js';

@ApiTags('Tags')
@Controller('tags')
export class TagsController {
  constructor(private readonly articlesService: ArticlesService) {}

  @Get()
  @ApiOperation({
    summary: 'Lấy danh sách toàn bộ thẻ bài viết (Get Tags)',
  })
  @ApiOkResponse({
    type: TagsResponseDto,
    description: 'Danh sách tags',
  })
  async getTags(): Promise<TagsResponseDto> {
    return this.articlesService.getTags();
  }
}
