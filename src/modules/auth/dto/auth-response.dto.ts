import { ApiProperty } from '@nestjs/swagger';

export class UserResponseDataDto {
  @ApiProperty({ example: 'john@example.com' })
  email: string;

  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  token: string;

  @ApiProperty({ example: 'johndoe' })
  username: string;

  @ApiProperty({ example: 'Software engineer at Sun*', nullable: true })
  bio: string | null;

  @ApiProperty({ example: 'https://api.realworld.io/images/smiley-cyrus.jpg', nullable: true })
  image: string | null;
}

export class AuthResponseDto {
  @ApiProperty({ type: UserResponseDataDto })
  user: UserResponseDataDto;
}

