import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { I18n, I18nContext } from 'nestjs-i18n';
import { HelloQueryDto } from './dto/hello-query.dto.js';
import { HelloResponseDto } from './dto/hello-response.dto.js';
import { HelloService } from './hello.service.js';

@ApiTags('Hello')
@Controller('hello')
export class HelloController {
  constructor(private readonly helloService: HelloService) {}

  @Get()
  @ApiOperation({
    summary: 'Chào mừng và kiểm tra sức khỏe hệ thống (Hỗ trợ đa ngôn ngữ i18n)',
    description:
      'Endpoint Hello World mẫu cho dự án. Hỗ trợ truyền tên người nhận và chọn ngôn ngữ phản hồi (en hoặc vi) thông qua query params, headers (Accept-Language), hoặc cookie.',
  })
  @ApiOkResponse({
    description: 'Phản hồi lời chào và thông tin sức khỏe hệ thống thành công',
    type: HelloResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Dữ liệu tham số query không hợp lệ (ví dụ: tên quá dài hoặc mã ngôn ngữ không hợp lệ)',
  })
  async getHello(
    @Query() query: HelloQueryDto,
    @I18n() i18n: I18nContext,
  ) {
    const lang = query.lang || query.l || i18n?.lang;
    return this.helloService.getGreeting(query.name, lang);
  }
}

