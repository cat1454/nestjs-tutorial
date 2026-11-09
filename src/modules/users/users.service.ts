import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from './entities/user.entity.js';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
  ) {}

  async create(data: Partial<UserEntity>): Promise<UserEntity> {
    const user = this.userRepository.create(data);
    return this.userRepository.save(user);
  }

  async findById(id: string): Promise<UserEntity | null> {
    return this.userRepository.findOne({ where: { id } });
  }

  async findByEmail(email: string, includePassword = false): Promise<UserEntity | null> {
    if (includePassword) {
      return this.userRepository
        .createQueryBuilder('user')
        .addSelect('user.password')
        .where('user.email = :email', { email })
        .getOne();
    }
    return this.userRepository.findOne({ where: { email } });
  }

  async findByUsername(username: string): Promise<UserEntity | null> {
    return this.userRepository.findOne({ where: { username } });
  }

  async findByEmailOrUsername(
    email: string,
    username: string,
  ): Promise<UserEntity | null> {
    return this.userRepository.findOne({
      where: [{ email }, { username }],
    });
  }

  async update(id: string, updateData: Partial<UserEntity>): Promise<UserEntity | null> {
    await this.userRepository.update(id, updateData);
    return this.findById(id);
  }
}

