import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
  TableUnique,
} from 'typeorm';

export class CreateFollowsAndAttachmentsTables1700000000001
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'follows',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'follower_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'following_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'created_at',
            type: 'timestamp with time zone',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    await queryRunner.createUniqueConstraint(
      'follows',
      new TableUnique({
        name: 'UQ_FOLLOWS_FOLLOWER_FOLLOWING',
        columnNames: ['follower_id', 'following_id'],
      }),
    );

    await queryRunner.createForeignKeys('follows', [
      new TableForeignKey({
        name: 'FK_FOLLOWS_FOLLOWER',
        columnNames: ['follower_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
      new TableForeignKey({
        name: 'FK_FOLLOWS_FOLLOWING',
        columnNames: ['following_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    ]);

    await queryRunner.createTable(
      new Table({
        name: 'attachments',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'target_type',
            type: 'varchar',
            length: '50',
            isNullable: false,
          },
          {
            name: 'target_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'url',
            type: 'varchar',
            length: '500',
            isNullable: false,
          },
          {
            name: 'file_name',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'file_type',
            type: 'varchar',
            length: '100',
            isNullable: false,
          },
          {
            name: 'file_size',
            type: 'int',
            isNullable: false,
          },
          {
            name: 'created_at',
            type: 'timestamp with time zone',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updated_at',
            type: 'timestamp with time zone',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'attachments',
      new TableIndex({
        name: 'IDX_ATTACHMENTS_TARGET',
        columnNames: ['target_type', 'target_id'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('attachments', true);
    await queryRunner.dropTable('follows', true);
  }
}

