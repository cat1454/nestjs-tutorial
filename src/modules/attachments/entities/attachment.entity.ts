import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  ATTACHMENT_URL_MAX_LENGTH,
  FILE_NAME_MAX_LENGTH,
  FILE_TYPE_MAX_LENGTH,
  TARGET_TYPE_MAX_LENGTH,
} from '../attachments.constants.js';

@Entity('attachments')
@Index('IDX_ATTACHMENTS_TARGET', ['targetType', 'targetId'])
export class AttachmentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    name: 'target_type',
    type: 'varchar',
    length: TARGET_TYPE_MAX_LENGTH,
  })
  targetType: string;

  @Column({ name: 'target_id', type: 'uuid' })
  targetId: string;

  @Column({ type: 'varchar', length: ATTACHMENT_URL_MAX_LENGTH })
  url: string;

  @Column({ name: 'file_name', type: 'varchar', length: FILE_NAME_MAX_LENGTH })
  fileName: string;

  @Column({ name: 'file_type', type: 'varchar', length: FILE_TYPE_MAX_LENGTH })
  fileType: string;

  @Column({ name: 'file_size', type: 'int' })
  fileSize: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp with time zone' })
  updatedAt: Date;
}

