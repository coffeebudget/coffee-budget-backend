import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddHierarchicalSuggestionFields1768600000001
  implements MigrationInterface
{
  name = 'AddHierarchicalSuggestionFields1768600000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add suggestion_source field to expense_plan_suggestions
    // 'pattern' = detected from recurring pattern
    // 'category_average' = fallback using category monthly average
    await queryRunner.query(`
      ALTER TABLE "expense_plan_suggestions"
      ADD COLUMN IF NOT EXISTS "suggestion_source" varchar(20) NOT NULL DEFAULT 'pattern'
    `);

    // Add category_monthly_average for discrepancy comparison
    await queryRunner.query(`
      ALTER TABLE "expense_plan_suggestions"
      ADD COLUMN IF NOT EXISTS "category_monthly_average" decimal(12, 2) NULL
    `);

    // Add discrepancy_percentage to store pattern vs category average diff
    await queryRunner.query(`
      ALTER TABLE "expense_plan_suggestions"
      ADD COLUMN IF NOT EXISTS "discrepancy_percentage" decimal(5, 2) NULL
    `);

    // Add has_discrepancy_warning flag for UI
    await queryRunner.query(`
      ALTER TABLE "expense_plan_suggestions"
      ADD COLUMN IF NOT EXISTS "has_discrepancy_warning" boolean NOT NULL DEFAULT false
    `);

    // Update existing suggestions to have 'pattern' as source
    await queryRunner.query(`
      UPDATE "expense_plan_suggestions"
      SET "suggestion_source" = 'pattern'
      WHERE "suggestion_source" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "expense_plan_suggestions"
      DROP COLUMN IF EXISTS "suggestion_source"
    `);

    await queryRunner.query(`
      ALTER TABLE "expense_plan_suggestions"
      DROP COLUMN IF EXISTS "category_monthly_average"
    `);

    await queryRunner.query(`
      ALTER TABLE "expense_plan_suggestions"
      DROP COLUMN IF EXISTS "discrepancy_percentage"
    `);

    await queryRunner.query(`
      ALTER TABLE "expense_plan_suggestions"
      DROP COLUMN IF EXISTS "has_discrepancy_warning"
    `);
  }
}
