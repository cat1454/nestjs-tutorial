import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsNotEmptyObject,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { COMMENT_BODY_MAX_LENGTH } from '../comments.constants.js';

export class CreateCommentPayloadDto {
  @ApiProperty({
    example: 'His name was my name too.',
    description: 'Nội dung bình luận',
    maxLength: COMMENT_BODY_MAX_LENGTH,
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(COMMENT_BODY_MAX_LENGTH)
  body: string;
}

export class CreateCommentDto {
  @ApiProperty({ type: CreateCommentPayloadDto })
  @IsNotEmptyObject()
  @ValidateNested()
  @Type(() => CreateCommentPayloadDto)
  comment: CreateCommentPayloadDto;
}
