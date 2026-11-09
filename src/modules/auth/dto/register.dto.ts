import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDefined,
  IsEmail,
  IsNotEmpty,
  IsString,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class RegisterDataDto {
  @ApiProperty({ example: 'johndoe' })
  @IsNotEmpty({ message: 'Tên người dùng không được để trống' })
  @IsString({ message: 'Tên người dùng phải là chuỗi' })
  username: string;

  @ApiProperty({ example: 'john@example.com' })
  @IsNotEmpty({ message: 'Email không được để trống' })
  @IsEmail({}, { message: 'Email không đúng định dạng' })
  email: string;

  @ApiProperty({ example: 'password123', minLength: 6 })
  @IsNotEmpty({ message: 'Mật khẩu không được để trống' })
  @IsString({ message: 'Mật khẩu phải là chuỗi' })
  @MinLength(6, { message: 'Mật khẩu phải có ít nhất 6 ký tự' })
  password: string;
}

export class RegisterDto {
  @ApiPropertyOptional({ type: RegisterDataDto })
  @ValidateIf((o) => !o.username && !o.email && !o.password)
  @IsDefined({ message: 'Thông tin user không được để trống' })
  @ValidateNested()
  @Type(() => RegisterDataDto)
  user?: RegisterDataDto;

  @ApiPropertyOptional({ example: 'johndoe' })
  @ValidateIf((o) => !o.user)
  @IsNotEmpty({ message: 'Tên người dùng không được để trống' })
  @IsString({ message: 'Tên người dùng phải là chuỗi' })
  username?: string;

  @ApiPropertyOptional({ example: 'john@example.com' })
  @ValidateIf((o) => !o.user)
  @IsNotEmpty({ message: 'Email không được để trống' })
  @IsEmail({}, { message: 'Email không đúng định dạng' })
  email?: string;

  @ApiPropertyOptional({ example: 'password123', minLength: 6 })
  @ValidateIf((o) => !o.user)
  @IsNotEmpty({ message: 'Mật khẩu không được để trống' })
  @IsString({ message: 'Mật khẩu phải là chuỗi' })
  @MinLength(6, { message: 'Mật khẩu phải có ít nhất 6 ký tự' })
  password?: string;
}
