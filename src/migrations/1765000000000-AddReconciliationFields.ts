import { MigrationInterface, QueryRunner, TableColumn, TableForeignKey, TableIndex } from 'typeorm';

export class AddReconciliationFields1765000000000 implements MigrationInterface {
  name = 'AddReconciliationFields1765000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('transaction');

    // Create enum type for reconciliation status
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "transaction_reconciliation_status_enum" AS ENUM(
          'not_reconciled',
          'reconciled_as_primary',
          'reconciled_as_secondary'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    const columnsToAdd = [
      new TableColumn({
        name: 'reconciledWithTransactionId',
        type: 'integer',
        isNullable: true,
      }),
      new TableColumn({
        name: 'reconciliationStatus',
        type: 'transaction_reconciliation_status_enum',
        default: "'not_reconciled'",
        isNullable: false,
      }),
    ];

    // Only add columns that don't exist
    for (const column of columnsToAdd) {
      const hasColumn = table?.columns.some((c) => c.name === column.name);
      if (!hasColumn) {
        await queryRunner.addColumn('transaction', column);
      }
    }

    // Add foreign key constraint
    const hasForeignKey = table?.foreignKeys.some(
      (fk) => fk.columnNames.includes('reconciledWithTransactionId')
    );

    if (!hasForeignKey) {
      await queryRunner.createForeignKey(
        'transaction',
        new TableForeignKey({
          name: 'FK_transaction_reconciledWith',
          columnNames: ['reconciledWithTransactionId'],
          referencedTableName: 'transaction',
          referencedColumnNames: ['id'],
          onDelete: 'SET NULL',
        }),
      );
    }

    // Add index for performance on reconciliation queries
    const hasIndex = table?.indices.some(
      (idx) => idx.columnNames.includes('reconciledWithTransactionId')
    );

    if (!hasIndex) {
      await queryRunner.createIndex(
        'transaction',
        new TableIndex({
          name: 'IDX_transaction_reconciled_with',
          columnNames: ['reconciledWithTransactionId'],
        }),
      );
    }

    // Add composite index for status queries
    const hasStatusIndex = table?.indices.some(
      (idx) => idx.name === 'IDX_transaction_reconciliation_status'
    );

    if (!hasStatusIndex) {
      await queryRunner.createIndex(
        'transaction',
        new TableIndex({
          name: 'IDX_transaction_reconciliation_status',
          columnNames: ['reconciliationStatus', 'source'],
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('transaction');

    // Drop indices first
    const statusIndex = table?.indices.find(
      (idx) => idx.name === 'IDX_transaction_reconciliation_status'
    );
    if (statusIndex) {
      await queryRunner.dropIndex('transaction', statusIndex);
    }

    const reconciledIndex = table?.indices.find(
      (idx) => idx.name === 'IDX_transaction_reconciled_with'
    );
    if (reconciledIndex) {
      await queryRunner.dropIndex('transaction', reconciledIndex);
    }

    // Drop foreign key
    const foreignKey = table?.foreignKeys.find(
      (fk) => fk.name === 'FK_transaction_reconciledWith'
    );
    if (foreignKey) {
      await queryRunner.dropForeignKey('transaction', foreignKey);
    }

    // Drop columns
    const columnsToRemove = [
      'reconciledWithTransactionId',
      'reconciliationStatus',
    ];

    for (const columnName of columnsToRemove) {
      const hasColumn = table?.columns.some((c) => c.name === columnName);
      if (hasColumn) {
        await queryRunner.dropColumn('transaction', columnName);
      }
    }

    // Drop enum type
    await queryRunner.query(`
      DROP TYPE IF EXISTS "transaction_reconciliation_status_enum";
    `);
  }
}
