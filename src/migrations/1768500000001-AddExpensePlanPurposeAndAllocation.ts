import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddExpensePlanPurposeAndAllocation1768500000001
  implements MigrationInterface
{
  name = 'AddExpensePlanPurposeAndAllocation1768500000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add purpose field with default 'sinking_fund'
    await queryRunner.query(`
      ALTER TABLE "expense_plans"
      ADD COLUMN IF NOT EXISTS "purpose" varchar(20) NOT NULL DEFAULT 'sinking_fund'
    `);

    // Add spending budget tracking fields
    await queryRunner.query(`
      ALTER TABLE "expense_plans"
      ADD COLUMN IF NOT EXISTS "spentThisMonth" decimal(12,2) NOT NULL DEFAULT 0
    `);

    await queryRunner.query(`
      ALTER TABLE "expense_plans"
      ADD COLUMN IF NOT EXISTS "allocatedThisMonth" decimal(12,2) NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "expense_plans"
      ADD COLUMN IF NOT EXISTS "allocationHistory" jsonb NULL
    `);

    // Set purpose based on existing plan types:
    // - goal and emergency_fund -> spending_budget
    // - all others -> sinking_fund (already default)
    await queryRunner.query(`
      UPDATE "expense_plans"
      SET "purpose" = 'spending_budget'
      WHERE "planType" IN ('goal', 'emergency_fund')
        OR "autoTrackCategory" = true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "expense_plans"
      DROP COLUMN IF EXISTS "allocationHistory"
    `);

    await queryRunner.query(`
      ALTER TABLE "expense_plans"
      DROP COLUMN IF EXISTS "allocatedThisMonth"
    `);

    await queryRunner.query(`
      ALTER TABLE "expense_plans"
      DROP COLUMN IF EXISTS "spentThisMonth"
    `);

    await queryRunner.query(`
      ALTER TABLE "expense_plans"
      DROP COLUMN IF EXISTS "purpose"
    `);
  }
}
