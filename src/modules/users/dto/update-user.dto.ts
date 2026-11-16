import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  EMAIL_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  USERNAME_MAX_LENGTH,
} from '../../auth/auth.constants.js';
import { BIO_MAX_LENGTH, IMAGE_URL_MAX_LENGTH } from '../users.constants.js';

export class UpdateUserDataDto {
  @ApiPropertyOptional({
    example: 'johndoe_updated',
    maxLength: USERNAME_MAX_LENGTH,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(USERNAME_MAX_LENGTH)
  username?: string;

  @ApiPropertyOptional({
    example: 'john_new@example.com',
    maxLength: EMAIL_MAX_LENGTH,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(EMAIL_MAX_LENGTH)
  email?: string;

  @ApiPropertyOptional({
    example: 'NewPassword@123',
    minLength: PASSWORD_MIN_LENGTH,
    maxLength: PASSWORD_MAX_LENGTH,
  })
  @IsOptional()
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  @MaxLength(PASSWORD_MAX_LENGTH)
  password?: string;

  @ApiPropertyOptional({
    example: 'Backend Developer at Sun*',
    maxLength: BIO_MAX_LENGTH,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(BIO_MAX_LENGTH)
  bio?: string;

  @ApiPropertyOptional({
    example: 'https://api.realworld.io/images/smiley-cyrus.jpg',
    maxLength: IMAGE_URL_MAX_LENGTH,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(IMAGE_URL_MAX_LENGTH)
  image?: string;
}

export class UpdateUserDto extends UpdateUserDataDto {
  @ApiPropertyOptional({ type: UpdateUserDataDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateUserDataDto)
  user?: UpdateUserDataDto;
}
