import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsDefined,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import {
  ARTICLE_BODY_MAX_LENGTH,
  ARTICLE_DESCRIPTION_MAX_LENGTH,
  ARTICLE_TITLE_MAX_LENGTH,
} from '../articles.constants.js';

export class UpdateArticleDataDto {
  @ApiPropertyOptional({
    example: 'Updated NestJS Article Title',
    maxLength: ARTICLE_TITLE_MAX_LENGTH,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsNotEmpty()
  @IsString()
  @MaxLength(ARTICLE_TITLE_MAX_LENGTH)
  title?: string;

  @ApiPropertyOptional({
    example: 'Updated article description',
    maxLength: ARTICLE_DESCRIPTION_MAX_LENGTH,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsNotEmpty()
  @IsString()
  @MaxLength(ARTICLE_DESCRIPTION_MAX_LENGTH)
  description?: string;

  @ApiPropertyOptional({
    example: 'Updated article body content...',
    maxLength: ARTICLE_BODY_MAX_LENGTH,
  })
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  @MaxLength(ARTICLE_BODY_MAX_LENGTH)
  body?: string;
}

export class UpdateArticleDto {
  @ApiProperty({ type: UpdateArticleDataDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => UpdateArticleDataDto)
  article: UpdateArticleDataDto;
}
