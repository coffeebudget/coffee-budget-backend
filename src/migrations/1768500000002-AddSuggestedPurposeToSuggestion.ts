import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSuggestedPurposeToSuggestion1768500000002
  implements MigrationInterface
{
  name = 'AddSuggestedPurposeToSuggestion1768500000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add suggested_purpose field to expense_plan_suggestions
    await queryRunner.query(`
      ALTER TABLE "expense_plan_suggestions"
      ADD COLUMN IF NOT EXISTS "suggested_purpose" varchar(20) NULL
    `);

    // Set suggested_purpose based on expense_type for existing suggestions:
    // - Sinking Fund: subscription, utility, insurance, mortgage, rent, loan, tax
    // - Spending Budget: variable, other_fixed, salary, investment
    await queryRunner.query(`
      UPDATE "expense_plan_suggestions"
      SET "suggested_purpose" = CASE
        WHEN "expense_type" IN ('subscription', 'utility', 'insurance', 'mortgage', 'rent', 'loan', 'tax')
          THEN 'sinking_fund'
        ELSE 'spending_budget'
      END
      WHERE "suggested_purpose" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "expense_plan_suggestions"
      DROP COLUMN IF EXISTS "suggested_purpose"
    `);
  }
}
