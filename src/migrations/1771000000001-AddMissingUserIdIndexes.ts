import { MigrationInterface, QueryRunner, TableIndex } from 'typeorm';

export class AddMissingUserIdIndexes1771000000001
  implements MigrationInterface
{
  name = 'AddMissingUserIdIndexes1771000000001';

  private readonly indexes: {
    table: string;
    name: string;
    columns: string[];
  }[] = [
    {
      table: 'transaction',
      name: 'IDX_transaction_userId',
      columns: ['userId'],
    },
    { table: 'category', name: 'IDX_category_userId', columns: ['userId'] },
    { table: 'tag', name: 'IDX_tag_userId', columns: ['userId'] },
    {
      table: 'bank_account',
      name: 'IDX_bank_account_userId',
      columns: ['userId'],
    },
    {
      table: 'credit_card',
      name: 'IDX_credit_card_userId',
      columns: ['userId'],
    },
    {
      table: 'import_log',
      name: 'IDX_import_log_userId',
      columns: ['userId'],
    },
    {
      table: 'keyword_stats',
      name: 'IDX_keyword_stats_userId',
      columns: ['userId'],
    },
    {
      table: 'pending_duplicates',
      name: 'IDX_pending_duplicates_userId',
      columns: ['userId'],
    },
    {
      table: 'prevented_duplicates',
      name: 'IDX_prevented_duplicates_userId',
      columns: ['userId'],
    },
    {
      table: 'sync_reports',
      name: 'IDX_sync_reports_userId',
      columns: ['userId'],
    },
    {
      table: 'detected_patterns',
      name: 'IDX_detected_patterns_userId',
      columns: ['user_id'],
    },
    // Composite index for date-range queries (dashboard, analytics, transaction list)
    {
      table: 'transaction',
      name: 'IDX_transaction_userId_createdAt',
      columns: ['userId', 'createdAt'],
    },
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const idx of this.indexes) {
      const table = await queryRunner.getTable(idx.table);
      if (!table) continue;

      const exists = table.indices.some((i) => i.name === idx.name);
      if (!exists) {
        await queryRunner.createIndex(
          idx.table,
          new TableIndex({ name: idx.name, columnNames: idx.columns }),
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const idx of [...this.indexes].reverse()) {
      const table = await queryRunner.getTable(idx.table);
      if (!table) continue;

      const existing = table.indices.find((i) => i.name === idx.name);
      if (existing) {
        await queryRunner.dropIndex(idx.table, existing);
      }
    }
  }
}
