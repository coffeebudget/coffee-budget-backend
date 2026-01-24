import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class CreateTransactionLinkSuggestions1769300000001
  implements MigrationInterface
{
  name = 'CreateTransactionLinkSuggestions1769300000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create transaction_link_suggestions table
    const hasTable = await queryRunner.hasTable('transaction_link_suggestions');
    if (!hasTable) {
      await queryRunner.createTable(
        new Table({
          name: 'transaction_link_suggestions',
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
              name: 'transactionId',
              type: 'int',
              isNullable: false,
            },
            {
              name: 'expensePlanId',
              type: 'int',
              isNullable: false,
            },
            {
              name: 'transactionAmount',
              type: 'decimal',
              precision: 12,
              scale: 2,
              isNullable: false,
            },
            {
              name: 'transactionDescription',
              type: 'varchar',
              length: '255',
              isNullable: false,
            },
            {
              name: 'transactionDate',
              type: 'timestamp',
              isNullable: false,
            },
            {
              name: 'suggestedType',
              type: 'varchar',
              length: '20',
              isNullable: false,
            },
            {
              name: 'status',
              type: 'varchar',
              length: '20',
              default: "'pending'",
              isNullable: false,
            },
            {
              name: 'expensePlanTransactionId',
              type: 'int',
              isNullable: true,
            },
            {
              name: 'rejectionReason',
              type: 'text',
              isNullable: true,
            },
            {
              name: 'reviewedAt',
              type: 'timestamp',
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

      // Add foreign keys
      await queryRunner.createForeignKey(
        'transaction_link_suggestions',
        new TableForeignKey({
          name: 'FK_transaction_link_suggestions_user',
          columnNames: ['userId'],
          referencedTableName: 'user',
          referencedColumnNames: ['id'],
          onDelete: 'CASCADE',
        }),
      );

      await queryRunner.createForeignKey(
        'transaction_link_suggestions',
        new TableForeignKey({
          name: 'FK_transaction_link_suggestions_transaction',
          columnNames: ['transactionId'],
          referencedTableName: 'transaction',
          referencedColumnNames: ['id'],
          onDelete: 'CASCADE',
        }),
      );

      await queryRunner.createForeignKey(
        'transaction_link_suggestions',
        new TableForeignKey({
          name: 'FK_transaction_link_suggestions_expense_plan',
          columnNames: ['expensePlanId'],
          referencedTableName: 'expense_plans',
          referencedColumnNames: ['id'],
          onDelete: 'CASCADE',
        }),
      );

      await queryRunner.createForeignKey(
        'transaction_link_suggestions',
        new TableForeignKey({
          name: 'FK_transaction_link_suggestions_plan_transaction',
          columnNames: ['expensePlanTransactionId'],
          referencedTableName: 'expense_plan_transactions',
          referencedColumnNames: ['id'],
          onDelete: 'SET NULL',
        }),
      );

      // Add indexes
      await queryRunner.createIndex(
        'transaction_link_suggestions',
        new TableIndex({
          name: 'IDX_transaction_link_suggestions_user_status',
          columnNames: ['userId', 'status'],
        }),
      );

      // Partial unique index for pending suggestions
      await queryRunner.query(`
        CREATE UNIQUE INDEX "IDX_transaction_link_suggestions_pending_unique"
        ON "transaction_link_suggestions" ("transactionId", "expensePlanId")
        WHERE "status" = 'pending'
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('transaction_link_suggestions');
    if (table) {
      // Drop partial unique index
      await queryRunner.query(
        'DROP INDEX IF EXISTS "IDX_transaction_link_suggestions_pending_unique"',
      );

      // Drop regular index
      const userStatusIndex = table.indices.find(
        (idx) => idx.name === 'IDX_transaction_link_suggestions_user_status',
      );
      if (userStatusIndex) {
        await queryRunner.dropIndex(
          'transaction_link_suggestions',
          userStatusIndex,
        );
      }

      // Drop foreign keys
      const fkUser = table.foreignKeys.find(
        (fk) => fk.name === 'FK_transaction_link_suggestions_user',
      );
      if (fkUser) {
        await queryRunner.dropForeignKey('transaction_link_suggestions', fkUser);
      }

      const fkTransaction = table.foreignKeys.find(
        (fk) => fk.name === 'FK_transaction_link_suggestions_transaction',
      );
      if (fkTransaction) {
        await queryRunner.dropForeignKey(
          'transaction_link_suggestions',
          fkTransaction,
        );
      }

      const fkExpensePlan = table.foreignKeys.find(
        (fk) => fk.name === 'FK_transaction_link_suggestions_expense_plan',
      );
      if (fkExpensePlan) {
        await queryRunner.dropForeignKey(
          'transaction_link_suggestions',
          fkExpensePlan,
        );
      }

      const fkPlanTransaction = table.foreignKeys.find(
        (fk) => fk.name === 'FK_transaction_link_suggestions_plan_transaction',
      );
      if (fkPlanTransaction) {
        await queryRunner.dropForeignKey(
          'transaction_link_suggestions',
          fkPlanTransaction,
        );
      }

      await queryRunner.dropTable('transaction_link_suggestions');
    }
  }
}
