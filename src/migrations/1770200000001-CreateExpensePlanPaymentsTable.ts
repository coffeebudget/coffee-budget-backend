import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class CreateExpensePlanPaymentsTable1770200000001
  implements MigrationInterface
{
  name = 'CreateExpensePlanPaymentsTable1770200000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable('expense_plan_payments');
    if (!hasTable) {
      await queryRunner.createTable(
        new Table({
          name: 'expense_plan_payments',
          columns: [
            {
              name: 'id',
              type: 'int',
              isPrimary: true,
              isGenerated: true,
              generationStrategy: 'increment',
            },
            {
              name: 'expensePlanId',
              type: 'int',
              isNullable: false,
            },
            {
              name: 'year',
              type: 'int',
              isNullable: false,
            },
            {
              name: 'month',
              type: 'int',
              isNullable: false,
            },
            {
              name: 'amount',
              type: 'decimal',
              precision: 12,
              scale: 2,
              isNullable: false,
            },
            {
              name: 'paymentDate',
              type: 'date',
              isNullable: false,
            },
            {
              name: 'paymentType',
              type: 'varchar',
              length: '20',
              default: "'manual'",
              isNullable: false,
            },
            {
              name: 'transactionId',
              type: 'int',
              isNullable: true,
            },
            {
              name: 'notes',
              type: 'varchar',
              length: '255',
              isNullable: true,
            },
            {
              name: 'createdAt',
              type: 'timestamp',
              default: 'CURRENT_TIMESTAMP',
              isNullable: false,
            },
          ],
        }),
        true,
      );

      // Foreign key to expense_plans (CASCADE delete)
      await queryRunner.createForeignKey(
        'expense_plan_payments',
        new TableForeignKey({
          name: 'FK_expense_plan_payments_plan',
          columnNames: ['expensePlanId'],
          referencedTableName: 'expense_plans',
          referencedColumnNames: ['id'],
          onDelete: 'CASCADE',
        }),
      );

      // Foreign key to transaction (SET NULL on delete)
      await queryRunner.createForeignKey(
        'expense_plan_payments',
        new TableForeignKey({
          name: 'FK_expense_plan_payments_transaction',
          columnNames: ['transactionId'],
          referencedTableName: 'transaction',
          referencedColumnNames: ['id'],
          onDelete: 'SET NULL',
        }),
      );

      // Index for querying payments by plan and period
      await queryRunner.createIndex(
        'expense_plan_payments',
        new TableIndex({
          name: 'IDX_expense_plan_payments_plan_period',
          columnNames: ['expensePlanId', 'year', 'month'],
        }),
      );

      // Index for looking up payments by transaction
      await queryRunner.createIndex(
        'expense_plan_payments',
        new TableIndex({
          name: 'IDX_expense_plan_payments_transaction',
          columnNames: ['transactionId'],
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('expense_plan_payments');
    if (table) {
      // Drop indexes
      const periodIndex = table.indices.find(
        (idx) => idx.name === 'IDX_expense_plan_payments_plan_period',
      );
      if (periodIndex) {
        await queryRunner.dropIndex('expense_plan_payments', periodIndex);
      }

      const transactionIndex = table.indices.find(
        (idx) => idx.name === 'IDX_expense_plan_payments_transaction',
      );
      if (transactionIndex) {
        await queryRunner.dropIndex('expense_plan_payments', transactionIndex);
      }

      // Drop foreign keys
      const fkPlan = table.foreignKeys.find(
        (fk) => fk.name === 'FK_expense_plan_payments_plan',
      );
      if (fkPlan) {
        await queryRunner.dropForeignKey('expense_plan_payments', fkPlan);
      }

      const fkTransaction = table.foreignKeys.find(
        (fk) => fk.name === 'FK_expense_plan_payments_transaction',
      );
      if (fkTransaction) {
        await queryRunner.dropForeignKey(
          'expense_plan_payments',
          fkTransaction,
        );
      }

      await queryRunner.dropTable('expense_plan_payments');
    }
  }
}
