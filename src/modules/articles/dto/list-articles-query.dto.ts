import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { USERNAME_MAX_LENGTH } from '../../auth/auth.constants.js';
import {
  DEFAULT_ARTICLES_LIMIT,
  DEFAULT_ARTICLES_OFFSET,
  MAX_ARTICLES_LIMIT,
  TAG_NAME_MAX_LENGTH,
} from '../articles.constants.js';

export class FeedArticlesQueryDto {
  @ApiPropertyOptional({
    default: DEFAULT_ARTICLES_LIMIT,
    minimum: 1,
    maximum: MAX_ARTICLES_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_ARTICLES_LIMIT)
  limit: number = DEFAULT_ARTICLES_LIMIT;

  @ApiPropertyOptional({
    default: DEFAULT_ARTICLES_OFFSET,
    minimum: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset: number = DEFAULT_ARTICLES_OFFSET;
}

export class ListArticlesQueryDto extends FeedArticlesQueryDto {
  @ApiPropertyOptional({
    example: 'nestjs',
    maxLength: TAG_NAME_MAX_LENGTH,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString()
  @MaxLength(TAG_NAME_MAX_LENGTH)
  tag?: string;

  @ApiPropertyOptional({
    example: 'johndoe',
    maxLength: USERNAME_MAX_LENGTH,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(USERNAME_MAX_LENGTH)
  author?: string;

  @ApiPropertyOptional({
    example: 'janedoe',
    maxLength: USERNAME_MAX_LENGTH,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(USERNAME_MAX_LENGTH)
  favorited?: string;
}
