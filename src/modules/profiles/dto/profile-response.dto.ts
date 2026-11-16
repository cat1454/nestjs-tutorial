import { ApiProperty } from '@nestjs/swagger';

export class ProfileDataDto {
  @ApiProperty({ example: 'johndoe' })
  username: string;

  @ApiProperty({ example: 'Software engineer at Sun*', nullable: true })
  bio: string | null;

  @ApiProperty({
    example: '/public/uploads/avatars/uuid.png',
    nullable: true,
  })
  image: string | null;

  @ApiProperty({ example: false })
  following: boolean;
}

export class ProfileResponseDto {
  @ApiProperty({ type: ProfileDataDto })
  profile: ProfileDataDto;
}

