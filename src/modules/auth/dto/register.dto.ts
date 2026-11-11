import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsDefined,
  IsEmail,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class RegisterDataDto {
  @ApiProperty({ example: 'johndoe', maxLength: 100 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  username: string;

  @ApiProperty({ example: 'john@example.com', maxLength: 255 })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsNotEmpty()
  @IsEmail()
  @MaxLength(255)
  email: string;

  @ApiProperty({ example: 'password123', minLength: 6, maxLength: 72 })
  @IsNotEmpty()
  @IsString()
  @MinLength(6)
  @MaxLength(72)
  password: string;
}

export class RegisterDto {
  @ApiPropertyOptional({ type: RegisterDataDto })
  @ValidateIf((o) => !o.username && !o.email && !o.password)
  @IsDefined()
  @ValidateNested()
  @Type(() => RegisterDataDto)
  user?: RegisterDataDto;

  @ApiPropertyOptional({ example: 'johndoe', maxLength: 100 })
  @ValidateIf((o) => !o.user)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  username?: string;

  @ApiPropertyOptional({ example: 'john@example.com', maxLength: 255 })
  @ValidateIf((o) => !o.user)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsNotEmpty()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @ApiPropertyOptional({ example: 'password123', minLength: 6, maxLength: 72 })
  @ValidateIf((o) => !o.user)
  @IsNotEmpty()
  @IsString()
  @MinLength(6)
  @MaxLength(72)
  password?: string;
}
