import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserEntity } from '../../users/entities/user.entity.js';
import {
  ARTICLE_DESCRIPTION_MAX_LENGTH,
  ARTICLE_SLUG_MAX_LENGTH,
  ARTICLE_TITLE_MAX_LENGTH,
} from '../articles.constants.js';
import { TagEntity } from './tag.entity.js';

@Entity('articles')
@Index('IDX_ARTICLES_AUTHOR_ID', ['authorId'])
@Index('IDX_ARTICLES_CREATED_AT', ['createdAt'])
export class ArticleEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: ARTICLE_SLUG_MAX_LENGTH, unique: true })
  slug: string;

  @Column({ type: 'varchar', length: ARTICLE_TITLE_MAX_LENGTH })
  title: string;

  @Column({ type: 'varchar', length: ARTICLE_DESCRIPTION_MAX_LENGTH })
  description: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ name: 'author_id', type: 'uuid' })
  authorId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'author_id' })
  author: UserEntity;

  @ManyToMany(() => TagEntity, { cascade: false })
  @JoinTable({
    name: 'article_tags',
    joinColumn: { name: 'article_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'tag_id', referencedColumnName: 'id' },
  })
  tags: TagEntity[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp with time zone' })
  updatedAt: Date;
}
