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

export class LoginDataDto {
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

export class LoginDto {
  @ApiPropertyOptional({ type: LoginDataDto })
  @ValidateIf((o) => !o.email && !o.password)
  @IsDefined()
  @ValidateNested()
  @Type(() => LoginDataDto)
  user?: LoginDataDto;

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
