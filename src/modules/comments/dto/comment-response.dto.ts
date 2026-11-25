import { ApiProperty } from '@nestjs/swagger';
import { ProfileDataDto } from '../../profiles/dto/profile-response.dto.js';

export class CommentDataDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id: string;

  @ApiProperty({ example: '2026-11-25T10:00:00.000Z' })
  createdAt: string;

  @ApiProperty({ example: '2026-11-25T10:00:00.000Z' })
  updatedAt: string;

  @ApiProperty({ example: 'His name was my name too.' })
  body: string;

  @ApiProperty({ type: ProfileDataDto })
  author: ProfileDataDto;
}

export class CommentResponseDto {
  @ApiProperty({ type: CommentDataDto })
  comment: CommentDataDto;
}

export class CommentsListResponseDto {
  @ApiProperty({ type: [CommentDataDto] })
  comments: CommentDataDto[];
}
