import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixInconsistentTransactionAmounts1768400000001
  implements MigrationInterface
{
  name = 'FixInconsistentTransactionAmounts1768400000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Fix expense transactions with positive amounts (should be negative)
    const expenseResult = await queryRunner.query(`
      UPDATE transaction
      SET amount = -ABS(amount)
      WHERE type = 'expense' AND amount > 0
    `);
    console.log(
      `Fixed ${expenseResult?.[1] || 0} expense transactions with positive amounts`,
    );

    // Fix income transactions with negative amounts (should be positive)
    const incomeResult = await queryRunner.query(`
      UPDATE transaction
      SET amount = ABS(amount)
      WHERE type = 'income' AND amount < 0
    `);
    console.log(
      `Fixed ${incomeResult?.[1] || 0} income transactions with negative amounts`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // This migration fixes data quality issues.
    // Reverting would reintroduce inconsistency, so we don't provide a down migration.
    // If needed, the amounts can be manually corrected.
    console.log(
      'Down migration not provided - reverting would reintroduce data inconsistency',
    );
  }
}
