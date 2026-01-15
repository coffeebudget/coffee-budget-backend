import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddExpensePlanAdjustmentFields1768300000001
  implements MigrationInterface
{
  name = 'AddExpensePlanAdjustmentFields1768300000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if columns already exist (idempotent)
    const table = await queryRunner.getTable('expense_plans');

    const hasSuggestedMonthlyContribution = table?.columns.some(
      (c) => c.name === 'suggestedMonthlyContribution',
    );

    if (!hasSuggestedMonthlyContribution) {
      // Add suggested monthly contribution (the new value we're suggesting)
      await queryRunner.query(`
        ALTER TABLE expense_plans
        ADD COLUMN "suggestedMonthlyContribution" decimal(12,2) DEFAULT NULL
      `);

      // Add suggested adjustment percent (positive = increase, negative = decrease)
      await queryRunner.query(`
        ALTER TABLE expense_plans
        ADD COLUMN "suggestedAdjustmentPercent" decimal(5,2) DEFAULT NULL
      `);

      // Add adjustment reason (spending_increased or spending_decreased)
      await queryRunner.query(`
        ALTER TABLE expense_plans
        ADD COLUMN "adjustmentReason" varchar(50) DEFAULT NULL
      `);

      // Add timestamp when adjustment was suggested
      await queryRunner.query(`
        ALTER TABLE expense_plans
        ADD COLUMN "adjustmentSuggestedAt" timestamp DEFAULT NULL
      `);

      // Add timestamp when user dismissed the adjustment
      await queryRunner.query(`
        ALTER TABLE expense_plans
        ADD COLUMN "adjustmentDismissedAt" timestamp DEFAULT NULL
      `);

      // Add index for finding plans with pending adjustments
      await queryRunner.query(`
        CREATE INDEX IDX_expense_plans_adjustment_suggested
        ON expense_plans("suggestedMonthlyContribution")
        WHERE "suggestedMonthlyContribution" IS NOT NULL
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop index
    await queryRunner.query(`
      DROP INDEX IF EXISTS IDX_expense_plans_adjustment_suggested
    `);

    // Drop columns
    await queryRunner.query(`
      ALTER TABLE expense_plans
      DROP COLUMN IF EXISTS "adjustmentDismissedAt"
    `);

    await queryRunner.query(`
      ALTER TABLE expense_plans
      DROP COLUMN IF EXISTS "adjustmentSuggestedAt"
    `);

    await queryRunner.query(`
      ALTER TABLE expense_plans
      DROP COLUMN IF EXISTS "adjustmentReason"
    `);

    await queryRunner.query(`
      ALTER TABLE expense_plans
      DROP COLUMN IF EXISTS "suggestedAdjustmentPercent"
    `);

    await queryRunner.query(`
      ALTER TABLE expense_plans
      DROP COLUMN IF EXISTS "suggestedMonthlyContribution"
    `);
  }
}
