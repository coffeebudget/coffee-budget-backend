import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAnalyticsFieldsToRecurringTransaction1745468000000
  implements MigrationInterface
{
  name = 'AddAnalyticsFieldsToRecurringTransaction1745468000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add dayOfMonth column
    await queryRunner.query(
      `ALTER TABLE "recurring_transaction" ADD "dayOfMonth" integer NULL`,
    );

    // Add dayOfWeek column
    await queryRunner.query(
      `ALTER TABLE "recurring_transaction" ADD "dayOfWeek" integer NULL`,
    );

    // Add month column
    await queryRunner.query(
      `ALTER TABLE "recurring_transaction" ADD "month" integer NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop the columns in reverse order
    await queryRunner.query(
      `ALTER TABLE "recurring_transaction" DROP COLUMN "month"`,
    );
    await queryRunner.query(
      `ALTER TABLE "recurring_transaction" DROP COLUMN "dayOfWeek"`,
    );
    await queryRunner.query(
      `ALTER TABLE "recurring_transaction" DROP COLUMN "dayOfMonth"`,
    );
  }
}
