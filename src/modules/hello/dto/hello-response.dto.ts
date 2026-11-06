import { ApiProperty } from '@nestjs/swagger';

export class HelloDataDto {
  @ApiProperty({
    example: 'Xin chào Sunner! Chào mừng bạn đến với Sun* NestJS Tutorial API.',
    description: 'Nội dung lời chào được địa phương hóa theo ngôn ngữ',
  })
  greeting: string;

  @ApiProperty({
    example: 'Hệ thống đang hoạt động ổn định và sẵn sàng.',
    description: 'Trạng thái kiểm tra sức khỏe hệ thống',
  })
  healthCheck: string;

  @ApiProperty({
    example: 'vi',
    description: 'Mã ngôn ngữ đang áp dụng',
  })
  locale: string;

  @ApiProperty({
    example: '2026-11-06T08:00:00.000Z',
    description: 'Thời điểm server xử lý',
  })
  serverTime: string;
}

export class HelloResponseDto {
  @ApiProperty({ example: 200 })
  statusCode: number;

  @ApiProperty({ example: 'Xin chào Sunner! Chào mừng bạn đến với Sun* NestJS Tutorial API.' })
  message: string;

  @ApiProperty({ type: HelloDataDto })
  data: HelloDataDto;

  @ApiProperty({ example: '2026-11-06T08:00:00.000Z' })
  timestamp: string;
}
