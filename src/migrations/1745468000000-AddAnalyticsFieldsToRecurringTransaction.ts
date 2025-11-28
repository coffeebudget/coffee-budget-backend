import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAnalyticsFieldsToRecurringTransaction1745468000000
  implements MigrationInterface
{
  name = 'AddAnalyticsFieldsToRecurringTransaction1745468000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('recurring_transaction');

    // Add dayOfMonth column if it doesn't exist
    const hasDayOfMonth = table?.columns.some((c) => c.name === 'dayOfMonth');
    if (!hasDayOfMonth) {
      await queryRunner.query(
        `ALTER TABLE "recurring_transaction" ADD "dayOfMonth" integer NULL`,
      );
    }

    // Add dayOfWeek column if it doesn't exist
    const hasDayOfWeek = table?.columns.some((c) => c.name === 'dayOfWeek');
    if (!hasDayOfWeek) {
      await queryRunner.query(
        `ALTER TABLE "recurring_transaction" ADD "dayOfWeek" integer NULL`,
      );
    }

    // Add month column if it doesn't exist
    const hasMonth = table?.columns.some((c) => c.name === 'month');
    if (!hasMonth) {
      await queryRunner.query(
        `ALTER TABLE "recurring_transaction" ADD "month" integer NULL`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('recurring_transaction');

    // Drop the columns in reverse order if they exist
    const hasMonth = table?.columns.some((c) => c.name === 'month');
    if (hasMonth) {
      await queryRunner.query(
        `ALTER TABLE "recurring_transaction" DROP COLUMN "month"`,
      );
    }

    const hasDayOfWeek = table?.columns.some((c) => c.name === 'dayOfWeek');
    if (hasDayOfWeek) {
      await queryRunner.query(
        `ALTER TABLE "recurring_transaction" DROP COLUMN "dayOfWeek"`,
      );
    }

    const hasDayOfMonth = table?.columns.some((c) => c.name === 'dayOfMonth');
    if (hasDayOfMonth) {
      await queryRunner.query(
        `ALTER TABLE "recurring_transaction" DROP COLUMN "dayOfMonth"`,
      );
    }
  }
}
