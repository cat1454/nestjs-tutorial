import { ApiProperty } from '@nestjs/swagger';
import { ProfileDataDto } from '../../profiles/dto/profile-response.dto.js';

export class ArticleDataDto {
  @ApiProperty({ example: 'how-to-build-clean-nestjs-apis-a1b2c3d4' })
  slug: string;

  @ApiProperty({ example: 'How to build clean NestJS APIs' })
  title: string;

  @ApiProperty({ example: 'Best practices for NestJS architecture and TypeORM' })
  description: string;

  @ApiProperty({ example: 'Full article body content goes here...' })
  body: string;

  @ApiProperty({ type: [String], example: ['backend', 'nestjs', 'typescript'] })
  tagList: string[];

  @ApiProperty({ example: '2026-11-19T07:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2026-11-19T07:00:00.000Z' })
  updatedAt: Date;

  @ApiProperty({ example: false })
  favorited: boolean;

  @ApiProperty({ example: 0 })
  favoritesCount: number;

  @ApiProperty({ type: ProfileDataDto })
  author: ProfileDataDto;
}

export class ArticleResponseDto {
  @ApiProperty({ type: ArticleDataDto })
  article: ArticleDataDto;
}

export class ArticlesListResponseDto {
  @ApiProperty({ type: [ArticleDataDto] })
  articles: ArticleDataDto[];

  @ApiProperty({ example: 1 })
  articlesCount: number;
}

export class TagsResponseDto {
  @ApiProperty({ type: [String], example: ['backend', 'nestjs', 'typescript'] })
  tags: string[];
}
