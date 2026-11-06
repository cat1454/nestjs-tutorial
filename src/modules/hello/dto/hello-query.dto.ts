import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class HelloQueryDto {
  @ApiPropertyOptional({
    description: 'Tên người muốn nhận lời chào',
    example: 'Sunner',
    maxLength: 50,
  })
  @IsOptional()
  @IsString({ message: 'Tên phải là một chuỗi ký tự' })
  @MaxLength(50, { message: 'Tên không được vượt quá 50 ký tự' })
  name?: string;

  @ApiPropertyOptional({
    description: 'Ngôn ngữ mong muốn phản hồi (en: Tiếng Anh, vi: Tiếng Việt)',
    enum: ['en', 'vi'],
    example: 'vi',
  })
  @IsOptional()
  @IsEnum(['en', 'vi'], { message: 'Ngôn ngữ hỗ trợ chỉ bao gồm en hoặc vi' })
  lang?: string;
}
