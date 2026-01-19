import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateMonthlyBudgetTable1768500000003
  implements MigrationInterface
{
  name = 'CreateMonthlyBudgetTable1768500000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'monthly_budgets',
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
          },
          {
            name: 'month',
            type: 'varchar',
            length: '7',
          },
          {
            name: 'autoDetectedIncome',
            type: 'decimal',
            precision: 12,
            scale: 2,
            default: 0,
          },
          {
            name: 'manualIncomeOverride',
            type: 'decimal',
            precision: 12,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'totalAllocated',
            type: 'decimal',
            precision: 12,
            scale: 2,
            default: 0,
          },
          {
            name: 'unallocated',
            type: 'decimal',
            precision: 12,
            scale: 2,
            default: 0,
          },
          {
            name: 'isComplete',
            type: 'boolean',
            default: false,
          },
          {
            name: 'notes',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
        foreignKeys: [
          {
            columnNames: ['userId'],
            referencedTableName: 'user',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
        ],
        uniques: [
          {
            columnNames: ['userId', 'month'],
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'monthly_budgets',
      new TableIndex({
        name: 'IDX_monthly_budgets_userId_month',
        columnNames: ['userId', 'month'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex(
      'monthly_budgets',
      'IDX_monthly_budgets_userId_month',
    );
    await queryRunner.dropTable('monthly_budgets');
  }
}
