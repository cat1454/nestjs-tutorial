import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
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
  MAX_TAGS_PER_ARTICLE,
  TAG_NAME_MAX_LENGTH,
} from '../articles.constants.js';

export class CreateArticleDataDto {
  @ApiProperty({
    example: 'How to build clean NestJS APIs',
    maxLength: ARTICLE_TITLE_MAX_LENGTH,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsNotEmpty()
  @IsString()
  @MaxLength(ARTICLE_TITLE_MAX_LENGTH)
  title: string;

  @ApiProperty({
    example: 'Best practices for NestJS architecture and TypeORM',
    maxLength: ARTICLE_DESCRIPTION_MAX_LENGTH,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsNotEmpty()
  @IsString()
  @MaxLength(ARTICLE_DESCRIPTION_MAX_LENGTH)
  description: string;

  @ApiProperty({
    example: 'Full article body content goes here...',
    maxLength: ARTICLE_BODY_MAX_LENGTH,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsNotEmpty()
  @IsString()
  @MaxLength(ARTICLE_BODY_MAX_LENGTH)
  body: string;

  @ApiPropertyOptional({
    type: [String],
    example: ['nestjs', 'typescript', 'backend'],
    maxItems: MAX_TAGS_PER_ARTICLE,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_TAGS_PER_ARTICLE)
  @Transform(({ value }: { value: unknown }) =>
    Array.isArray(value)
      ? Array.from(
          new Set(
            value
              .map((tag: unknown) =>
                typeof tag === 'string' ? tag.trim().toLowerCase() : tag,
              )
              .filter((tag: unknown) => tag !== ''),
          ),
        )
      : value,
  )
  @IsString({ each: true })
  @MaxLength(TAG_NAME_MAX_LENGTH, { each: true })
  tagList?: string[];
}

export class CreateArticleDto {
  @ApiProperty({ type: CreateArticleDataDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => CreateArticleDataDto)
  article: CreateArticleDataDto;
}
