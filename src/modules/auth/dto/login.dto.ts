import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDefined,
  IsEmail,
  IsNotEmpty,
  IsString,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class LoginDataDto {
  @ApiProperty({ example: 'john@example.com' })
  @IsNotEmpty({ message: 'Email không được để trống' })
  @IsEmail({}, { message: 'Email không đúng định dạng' })
  email: string;

  @ApiProperty({ example: 'password123' })
  @IsNotEmpty({ message: 'Mật khẩu không được để trống' })
  @IsString({ message: 'Mật khẩu phải là chuỗi' })
  password: string;
}

export class LoginDto {
  @ApiPropertyOptional({ type: LoginDataDto })
  @ValidateIf((o) => !o.email && !o.password)
  @IsDefined({ message: 'Thông tin đăng nhập không được để trống' })
  @ValidateNested()
  @Type(() => LoginDataDto)
  user?: LoginDataDto;

  @ApiPropertyOptional({ example: 'john@example.com' })
  @ValidateIf((o) => !o.user)
  @IsNotEmpty({ message: 'Email không được để trống' })
  @IsEmail({}, { message: 'Email không đúng định dạng' })
  email?: string;

  @ApiPropertyOptional({ example: 'password123' })
  @ValidateIf((o) => !o.user)
  @IsNotEmpty({ message: 'Mật khẩu không được để trống' })
  @IsString({ message: 'Mật khẩu phải là chuỗi' })
  password?: string;
}
