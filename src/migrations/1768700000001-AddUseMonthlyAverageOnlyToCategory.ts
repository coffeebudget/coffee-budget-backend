import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUseMonthlyAverageOnlyToCategory1768700000001
  implements MigrationInterface
{
  name = 'AddUseMonthlyAverageOnlyToCategory1768700000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add useMonthlyAverageOnly field to category table
    // When true, skip pattern detection for this category and use monthly average fallback.
    // Useful for categories with fragmented spending (e.g., Groceries with many supermarkets).
    await queryRunner.query(`
      ALTER TABLE "category"
      ADD COLUMN IF NOT EXISTS "useMonthlyAverageOnly" boolean NOT NULL DEFAULT false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "category"
      DROP COLUMN IF EXISTS "useMonthlyAverageOnly"
    `);
  }
}
