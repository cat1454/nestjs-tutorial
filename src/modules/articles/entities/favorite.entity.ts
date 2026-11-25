import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

@Entity('favorites')
@Unique('UQ_FAVORITES_USER_ARTICLE', ['userId', 'articleId'])
@Index('IDX_FAVORITES_ARTICLE_ID', ['articleId'])
export class FavoriteEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'article_id', type: 'uuid' })
  articleId: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;
}
