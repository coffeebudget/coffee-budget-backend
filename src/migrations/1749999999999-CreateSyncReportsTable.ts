import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
} from 'typeorm';

export class CreateSyncReportsTable1749999999999 implements MigrationInterface {
  name = 'CreateSyncReportsTable1749999999999';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if table already exists
    const tableExists = await queryRunner.hasTable('sync_reports');
    if (tableExists) {
      return;
    }

    // Create sync_reports table
    await queryRunner.createTable(
      new Table({
        name: 'sync_reports',
        columns: [
          {
            name: 'id',
            type: 'int',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          {
            name: 'userId',
            type: 'int',
            isNullable: false,
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['success', 'partial', 'failed'],
            isNullable: false,
          },
          {
            name: 'syncStartedAt',
            type: 'timestamp',
            isNullable: false,
          },
          {
            name: 'syncCompletedAt',
            type: 'timestamp',
            isNullable: false,
          },
          {
            name: 'totalAccounts',
            type: 'int',
            isNullable: false,
          },
          {
            name: 'successfulAccounts',
            type: 'int',
            isNullable: false,
          },
          {
            name: 'failedAccounts',
            type: 'int',
            isNullable: false,
          },
          {
            name: 'totalNewTransactions',
            type: 'int',
            isNullable: false,
          },
          {
            name: 'totalDuplicates',
            type: 'int',
            isNullable: false,
          },
          {
            name: 'totalPendingDuplicates',
            type: 'int',
            isNullable: false,
          },
          {
            name: 'syncType',
            type: 'varchar',
            default: "'automatic'",
            isNullable: false,
          },
          {
            name: 'accountResults',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'errorMessage',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
        ],
      }),
      true,
    );

    // Add foreign key to user table
    await queryRunner.createForeignKey(
      'sync_reports',
      new TableForeignKey({
        columnNames: ['userId'],
        referencedTableName: 'user',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Find and drop foreign key
    const table = await queryRunner.getTable('sync_reports');
    const foreignKey = table?.foreignKeys.find(
      (fk) => fk.columnNames.indexOf('userId') !== -1,
    );
    if (foreignKey) {
      await queryRunner.dropForeignKey('sync_reports', foreignKey);
    }

    // Drop the sync_reports table
    await queryRunner.dropTable('sync_reports');
  }
}
