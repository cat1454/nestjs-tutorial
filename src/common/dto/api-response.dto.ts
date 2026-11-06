import { ApiProperty } from '@nestjs/swagger';

export class ApiResponseDto<T> {
  @ApiProperty({ example: 200, description: 'Mã HTTP status code' })
  statusCode: number;

  @ApiProperty({ example: 'Thao tác thành công', description: 'Thông điệp phản hồi' })
  message: string;

  @ApiProperty({ description: 'Dữ liệu trả về' })
  data: T;

  @ApiProperty({ example: '2026-11-06T08:00:00.000Z', description: 'Thời điểm server phản hồi (ISO 8601)' })
  timestamp: string;

  constructor(statusCode: number, message: string, data: T) {
    this.statusCode = statusCode;
    this.message = message;
    this.data = data;
    this.timestamp = new Date().toISOString();
  }
}

