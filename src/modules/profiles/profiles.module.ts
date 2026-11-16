import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard.js';
import { UsersModule } from '../users/users.module.js';
import { FollowEntity } from './entities/follow.entity.js';
import { ProfilesController } from './profiles.controller.js';
import { ProfilesService } from './profiles.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([FollowEntity]),
    UsersModule,
    JwtModule.register({}),
  ],
  controllers: [ProfilesController],
  providers: [ProfilesService, JwtAuthGuard, OptionalJwtAuthGuard],
  exports: [ProfilesService],
})
export class ProfilesModule {}

