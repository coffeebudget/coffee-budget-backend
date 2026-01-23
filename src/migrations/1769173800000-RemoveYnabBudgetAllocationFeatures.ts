import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration to remove YNAB Budget Allocation features:
 * 1. Drop monthly_budgets table
 * 2. Drop spentThisMonth, allocatedThisMonth, allocationHistory columns from expense_plans
 */
export class RemoveYnabBudgetAllocationFeatures1769173800000
  implements MigrationInterface
{
  name = 'RemoveYnabBudgetAllocationFeatures1769173800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop monthly_budgets table
    await queryRunner.query(`DROP TABLE IF EXISTS "monthly_budgets"`);

    // Drop YNAB allocation columns from expense_plans
    await queryRunner.query(
      `ALTER TABLE "expense_plans" DROP COLUMN IF EXISTS "spentThisMonth"`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_plans" DROP COLUMN IF EXISTS "allocatedThisMonth"`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_plans" DROP COLUMN IF EXISTS "allocationHistory"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Recreate monthly_budgets table
    await queryRunner.query(`
      CREATE TABLE "monthly_budgets" (
        "id" SERIAL NOT NULL,
        "userId" integer NOT NULL,
        "month" character varying(7) NOT NULL,
        "autoDetectedIncome" numeric(12,2) NOT NULL DEFAULT '0',
        "manualIncomeOverride" numeric(12,2),
        "totalAllocated" numeric(12,2) NOT NULL DEFAULT '0',
        "unallocated" numeric(12,2) NOT NULL DEFAULT '0',
        "isComplete" boolean NOT NULL DEFAULT false,
        "notes" text,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_monthly_budgets_user_month" UNIQUE ("userId", "month"),
        CONSTRAINT "PK_monthly_budgets" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_monthly_budgets_user_month" ON "monthly_budgets" ("userId", "month")`,
    );
    await queryRunner.query(
      `ALTER TABLE "monthly_budgets" ADD CONSTRAINT "FK_monthly_budgets_user" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE`,
    );

    // Recreate allocation columns on expense_plans
    await queryRunner.query(
      `ALTER TABLE "expense_plans" ADD "spentThisMonth" numeric(12,2) NOT NULL DEFAULT '0'`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_plans" ADD "allocatedThisMonth" numeric(12,2)`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_plans" ADD "allocationHistory" jsonb`,
    );
  }
}
